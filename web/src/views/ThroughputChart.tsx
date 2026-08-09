interface Point {
  day: string;
  completed: number;
  failed: number;
}

const WIDTH = 100;
const HEIGHT = 100;

export default function ThroughputChart({ data }: { data: Point[] }) {
  if (!data.length) return <div className="text-center py-10 text-muted-foreground text-sm font-medium">No execution history yet.</div>;

  const max = Math.max(1, ...data.map((d) => d.completed + d.failed));
  const barWidth = WIDTH / data.length;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-[160px] overflow-visible" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={WIDTH} y1={HEIGHT * (1 - f)} y2={HEIGHT * (1 - f)} className="stroke-border" strokeWidth={0.2} strokeDasharray="1,1" />
        ))}
        {data.map((d, i) => {
          const completedH = (d.completed / max) * HEIGHT;
          const failedH = (d.failed / max) * HEIGHT;
          const x = i * barWidth + barWidth * 0.2;
          const w = barWidth * 0.6;
          const empty = d.completed + d.failed === 0;
          return (
            <g key={d.day} className="group transition-transform hover:-translate-y-0.5">
              {empty ? (
                <rect x={x} y={HEIGHT - 0.6} width={w} height={0.6} className="fill-border" />
              ) : (
                <>
                  <rect x={x} y={HEIGHT - completedH - failedH} width={w} height={failedH} className="fill-red-500 opacity-90 hover:opacity-100" />
                  <rect x={x} y={HEIGHT - completedH} width={w} height={completedH} className="fill-emerald-500 opacity-90 hover:opacity-100" />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex w-full mt-2">
        {data.map((d) => (
          <div key={d.day} className="flex-1 text-center text-[10px] font-semibold text-muted-foreground">
            {d.day.slice(5)}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-6">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          <span className="text-xs font-semibold text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-sm bg-red-500" />
          <span className="text-xs font-semibold text-muted-foreground">Failed</span>
        </div>
      </div>
    </div>
  );
}
