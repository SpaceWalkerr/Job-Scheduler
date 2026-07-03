interface Point {
  day: string;
  completed: number;
  failed: number;
}

const WIDTH = 100;
const HEIGHT = 100;

export default function ThroughputChart({ data }: { data: Point[] }) {
  if (!data.length) return <div className="empty">No execution history yet.</div>;

  const max = Math.max(1, ...data.map((d) => d.completed + d.failed));
  const barWidth = WIDTH / data.length;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={160} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={WIDTH} y1={HEIGHT * (1 - f)} y2={HEIGHT * (1 - f)} stroke="var(--border)" strokeWidth={0.2} />
        ))}
        {data.map((d, i) => {
          const completedH = (d.completed / max) * HEIGHT;
          const failedH = (d.failed / max) * HEIGHT;
          const x = i * barWidth + barWidth * 0.2;
          const w = barWidth * 0.6;
          const empty = d.completed + d.failed === 0;
          return (
            <g key={d.day}>
              {empty ? (
                <rect x={x} y={HEIGHT - 0.6} width={w} height={0.6} fill="var(--border-strong)" />
              ) : (
                <>
                  <rect x={x} y={HEIGHT - completedH - failedH} width={w} height={failedH} fill="var(--red)" opacity={0.85} />
                  <rect x={x} y={HEIGHT - completedH} width={w} height={completedH} fill="var(--green)" opacity={0.85} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex" }}>
        {data.map((d) => (
          <div key={d.day} style={{ flex: 1, textAlign: "center", fontSize: 11, color: "var(--text-faint)" }}>
            {d.day.slice(5)}
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, fontSize: 12 }}>
        <span className="row" style={{ gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--green)", display: "inline-block" }} />
          <span className="muted">Completed</span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--red)", display: "inline-block" }} />
          <span className="muted">Failed</span>
        </span>
      </div>
    </div>
  );
}
