export default function Header() {
  return (
    <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 text-white">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold tracking-tight">Teamopoly</span>
          <span className="text-xs bg-black/20 rounded-full px-2 py-1">Fairness dashboard • Monopoly skin</span>
        </div>
        <div className="text-xs opacity-90">Hackathon build</div>
      </div>
    </div>
  );
}
