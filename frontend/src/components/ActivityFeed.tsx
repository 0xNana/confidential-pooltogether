import { ArrowUpRight, Blocks, Radio } from "lucide-react"
import type { ActivityItem } from "../hooks/useConfidentialPoolTogether"

export function ActivityFeed({ activity, loading }: { activity: ActivityItem[]; loading: boolean }) {
  const state = loading ? "loading" : activity.length === 0 ? "empty" : "ready"
  return (
    <section className="activity-card ruled-panel" aria-labelledby="activity-title" aria-live="polite" aria-busy={loading} data-testid="activity-feed" data-state={state}>
      <header className="compact-titlebar"><div><p className="eyebrow">Public metadata only</p><h2 id="activity-title">Encrypted activity</h2></div><span className="live-label"><Radio size={12} /> Live</span></header>
      {loading ? (
        <div className="activity-skeleton" aria-label="Loading activity"><i /><i /><i /></div>
      ) : activity.length === 0 ? (
        <div className="empty-activity" data-testid="activity-empty"><Blocks size={20} /><strong>No pool events yet</strong><p>The deployed contract is live. Deposits and draw lifecycle events will appear here without amounts.</p></div>
      ) : (
        <ol className="activity-list" data-testid="activity-list">
          {activity.map((item) => (
            <li key={item.id}>
              <span className="activity-mark"><i /></span>
              <div><strong>{item.label}</strong><small>Block {item.blockNumber.toLocaleString()}</small></div>
              <a href={`https://sepolia.etherscan.io/tx/${item.transactionHash}`} target="_blank" rel="noreferrer" aria-label={`Open ${item.label} transaction`}><ArrowUpRight size={14} /></a>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
