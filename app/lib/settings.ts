import type { IconName } from "../icons";

export type SettingOption = {
  slug: string;
  title: string;
  description: string;
  status: string;
  details: string[];
  icon: IconName;
};

export const settingOptions: SettingOption[] = [
  {
    slug: "general",
    title: "General",
    description: "Platform information and basic configuration.",
    status: "AppEdge internal console",
    details: [
      "AppEdge is the internal console for managing client applications, custom domains and routes.",
      "Operational records are stored in AppEdge D1.",
    ],
    icon: "settings",
  },
  {
    slug: "integrations",
    title: "Integrations",
    description: "Infrastructure service connections.",
    status: "Cloudflare API operations not connected",
    details: [
      "AppEdge reads its operational records through the D1 binding.",
      "Cloudflare API operations for infrastructure changes are not connected.",
    ],
    icon: "globe",
  },
  {
    slug: "authentication",
    title: "Authentication",
    description: "Identity provider and sign-in configuration.",
    status: "Microsoft Entra ID",
    details: [
      "Microsoft Entra ID is the sole identity provider.",
      "Sign-in requires the AppEdge.Administrator application role in the verified ID token.",
    ],
    icon: "users",
  },
  {
    slug: "access-control",
    title: "Access control",
    description: "People assigned to the AppEdge role.",
    status: "Managed in Microsoft Entra",
    details: [
      "Assign the AppEdge.Administrator application role to people or groups in the Entra Enterprise application.",
      "AppEdge checks the role claim at sign-in and does not keep a separate administrator allowlist in D1.",
    ],
    icon: "users",
  },
  {
    slug: "gateway",
    title: "Gateway",
    description: "Gateway configuration, routing registry and connectivity.",
    status: "Gateway connection not configured",
    details: [
      "The gateway service is not connected to AppEdge.",
      "Routing operations remain unavailable until the gateway integration is configured.",
    ],
    icon: "route",
  },
  {
    slug: "audit-and-security",
    title: "Audit and security",
    description: "Audit records and relevant security controls.",
    status: "Audit events stored in AppEdge D1",
    details: [
      "Client, application, domain and route creation is saved to AppEdge D1 together with an audit event.",
      "Infrastructure provisioning actions remain unavailable until the service integrations are connected.",
      "Recorded audit events can be reviewed on the Activity page.",
    ],
    icon: "activity",
  },
];

export function settingOptionForSlug(slug: string): SettingOption | null {
  return settingOptions.find((setting) => setting.slug === slug) ?? null;
}
