import Link from "next/link";
import type { ReactNode } from "react";
import { OriginAction, RouteSwitch } from "./route-actions";
import { SearchField } from "./search-field";
import { buildHref, type QueryValues } from "./lib/query";
import type { SectionTable, TableCell } from "./lib/section-tables";

export function DataTable({ table, path, query, parameters, actions }: {
  table: SectionTable;
  path: string;
  query: string;
  parameters: QueryValues;
  actions?: ReactNode;
}) {
  const needle = query.toLowerCase();
  const rows = needle ? table.rows.filter((row) => row.searchText.includes(needle)) : table.rows;

  return <>
    <div className="table-controls">
      <SearchField initialValue={query}/>
      {actions}
      {table.filters.length > 0 && <div role="radiogroup" aria-label="Stage" className="chip-group">
        {table.filters.map((filter) => <Link key={filter.key} role="radio" aria-checked={filter.active} scroll={false} className={`chip${filter.active ? " is-active" : ""}`} href={buildHref(path, { ...parameters, filter: filter.key === "all" ? null : filter.key })}>{filter.label} <span>{filter.count}</span></Link>)}
      </div>}
    </div>
    <div className="table-card">
      <div className="table-scroll"><table>
        <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const href = row.domainId ? buildHref(path, { ...parameters, domain: row.domainId }) : null;
          const originHref = row.originApplicationId ? buildHref(path, { ...parameters, modal: "origin", application: row.originApplicationId }) : null;
          return <tr key={row.key} className={href || originHref ? "is-clickable" : undefined}>{row.cells.map((cell, index) => <td key={index}>
            {index === 0 && href ? <Link href={href} scroll={false} className="row-link"><Cell cell={cell}/></Link> : index === 0 && originHref ? <OriginAction href={originHref} className="row-link"><Cell cell={cell}/></OriginAction> : <Cell cell={cell}/>}
          </td>)}</tr>;
        })}</tbody>
      </table></div>
      {rows.length === 0 && <p className="table-empty">Nothing matches your search or filter.</p>}
    </div>
  </>;
}

function Cell({ cell }: { cell: TableCell }) {
  switch (cell.kind) {
    case "text": return <span className={`cell-text${cell.strong ? " is-strong" : ""}${cell.muted ? " is-muted" : ""}`}>{cell.text}</span>;
    case "mono": return <span className="cell-mono">{cell.text}</span>;
    case "badge": return <span className={`pill tone-${cell.tone}`}><i/>{cell.text}</span>;
    case "switch": return <RouteSwitch domainId={cell.domainId} hostname={cell.hostname} on={cell.on}/>;
  }
}
