"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdministrator } from "../../lib/auth";
import { getAppEdgeDatabase } from "./d1";
import type { ManagementSection } from "./data";

export type CreateRecordFormState = {
  error: string | null;
};

const sectionSlugs: Record<ManagementSection, string> = {
  Clients: "clients",
  Applications: "applications",
  Domains: "domains",
  Routes: "routes",
  Activity: "activity",
  Settings: "settings",
};

export async function createManagementRecord(
  _previousState: CreateRecordFormState,
  formData: FormData,
): Promise<CreateRecordFormState> {
  const administrator = await requireAdministrator();
  const section = formValue(formData, "section") as ManagementSection;
  if (!Object.prototype.hasOwnProperty.call(sectionSlugs, section) || ["Activity", "Settings"].includes(section)) {
    return { error: "Choose a valid record type." };
  }

  const database = getAppEdgeDatabase();
  const recordId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const audit = (resourceType: string, action: string) => database.prepare(`
    INSERT INTO audit_events (id, actor_name, action, resource_type, resource_id, outcome, metadata)
    VALUES (?, ?, ?, ?, ?, 'success', '{}')
  `).bind(auditId, administrator.displayName, action, resourceType, recordId);

  try {
    switch (section) {
      case "Clients": {
        const name = formValue(formData, "name");
        const clientReference = optionalValue(formData, "client_reference");
        const contactName = optionalValue(formData, "contact_name");
        const contactEmail = optionalValue(formData, "contact_email").toLowerCase();
        const notes = optionalValue(formData, "notes");
        if (!name || name.length > 120) return { error: "Enter a client name up to 120 characters." };
        if (clientReference.length > 100 || contactName.length > 120 || notes.length > 2000) {
          return { error: "One or more fields exceed the allowed length." };
        }
        if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
          return { error: "Enter a valid contact email address." };
        }
        await database.batch([
          database.prepare(`
            INSERT INTO clients (id, name, client_reference, contact_name, contact_email, status, notes)
            VALUES (?, ?, ?, ?, ?, 'active', ?)
          `).bind(recordId, name, clientReference || null, contactName || null, contactEmail || null, notes || null),
          audit("client", "Client created"),
        ]);
        break;
      }
      case "Applications": {
        const clientId = formValue(formData, "client_id");
        const name = formValue(formData, "name");
        const identifierInput = formValue(formData, "identifier");
        const applicationType = formValue(formData, "application_type");
        const environment = formValue(formData, "environment");
        const originInput = optionalValue(formData, "origin_url");
        const identifier = identifierInput || `${slugify(name) || "application"}-${crypto.randomUUID().slice(0, 8)}`;
        if (!await activeClientExists(clientId)) return { error: "Select an active client." };
        if (!name || name.length > 120) return { error: "Enter an application name up to 120 characters." };
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier) || identifier.length > 80) {
          return { error: "Use a unique identifier with lowercase letters, numbers and hyphens." };
        }
        if (!["cloudflare_worker", "external_https"].includes(applicationType)) return { error: "Choose an application type." };
        if (!["development", "staging", "production"].includes(environment)) return { error: "Choose an environment." };
        const originUrl = normalizeHttpsUrl(originInput);
        if (originInput && !originUrl) return { error: "The origin URL must be a valid HTTPS URL." };
        await database.batch([
          database.prepare(`
            INSERT INTO applications (id, client_id, name, identifier, application_type, environment, origin_url, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
          `).bind(recordId, clientId, name, identifier, applicationType, environment, originUrl),
          audit("application", "Application created"),
        ]);
        break;
      }
      case "Domains": {
        const applicationId = formValue(formData, "application_id");
        const hostname = formValue(formData, "hostname").toLowerCase().replace(/\.$/, "");
        const application = await database.prepare(`
          SELECT client_id FROM applications
          INNER JOIN clients ON clients.id = applications.client_id
          WHERE applications.id = ? AND applications.status != 'disabled' AND clients.status = 'active'
        `).bind(applicationId).first<{ client_id: string }>();
        if (!application) return { error: "Select an application attached to an active client." };
        if (!isHostname(hostname)) return { error: "Enter a valid public hostname, such as app.example.com." };
        await database.batch([
          database.prepare(`
            INSERT INTO domains (id, client_id, application_id, hostname, ownership_status, dns_status, ssl_status)
            VALUES (?, ?, ?, ?, 'pending', 'pending', 'pending')
          `).bind(recordId, application.client_id, applicationId, hostname),
          audit("domain", "Domain created"),
        ]);
        break;
      }
      case "Routes": {
        const domainId = formValue(formData, "domain_id");
        const environment = formValue(formData, "environment");
        const domain = await database.prepare(`
          SELECT application_id FROM domains WHERE id = ?
        `).bind(domainId).first<{ application_id: string }>();
        if (!domain) return { error: "Select a registered domain." };
        if (!["development", "staging", "production"].includes(environment)) return { error: "Choose an environment." };
        await database.batch([
          database.prepare(`
            INSERT INTO routes (id, domain_id, application_id, environment, status)
            VALUES (?, ?, ?, ?, 'draft')
          `).bind(recordId, domainId, domain.application_id, environment),
          audit("route", "Route created"),
        ]);
        break;
      }
    }
  } catch {
    return { error: "The record could not be saved. Check for duplicate names, identifiers, hostnames, or routes and try again." };
  }

  const path = `/${sectionSlugs[section]}`;
  revalidatePath("/");
  revalidatePath(path);
  redirect(`${path}?created=1`);
}

async function activeClientExists(clientId: string): Promise<boolean> {
  if (!clientId) return false;
  const database = getAppEdgeDatabase();
  const client = await database.prepare("SELECT id FROM clients WHERE id = ? AND status = 'active'")
    .bind(clientId)
    .first<{ id: string }>();
  return client !== null;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalValue(formData: FormData, key: string): string {
  return formValue(formData, key);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function normalizeHttpsUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isHostname(value: string): boolean {
  return value.length <= 253
    && value.includes(".")
    && value.split(".").every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
