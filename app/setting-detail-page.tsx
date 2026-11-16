import Link from "next/link";
import styles from "./settings.module.css";
import { Icon } from "./icons";
import type { SettingOption } from "./lib/settings";

export function SettingDetailPage({ setting }: { setting: SettingOption }) {
  return <>
    <div className="page-heading"><div><div className="eyebrow">APPEDGE WORKSPACE</div><h1>{setting.title}</h1><p>{setting.description}</p></div><Link className="button button-secondary" href="/settings"><Icon name="arrow" size={15}/> All settings</Link></div>
    <section className={styles.detailCard} aria-label={`${setting.title} details`}>
      <div className={styles.detailStatus}><span>Current status</span><strong>{setting.status}</strong></div>
      <div className={styles.detailCopy}>{setting.details.map((detail) => <p key={detail}>{detail}</p>)}</div>
      {setting.slug === "audit-and-security" && <Link className="text-button" href="/activity">View activity <Icon name="arrow" size={15}/></Link>}
    </section>
    <footer className="page-footer"><span>AppEdge <b>·</b> Internal infrastructure console</span><Link href="/settings">Back to Settings</Link></footer>
  </>;
}
