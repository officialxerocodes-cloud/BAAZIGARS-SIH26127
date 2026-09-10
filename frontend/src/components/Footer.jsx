import { footerInfo } from "../data/mockData";

export default function Footer({ info = footerInfo }) {
  return (
    <footer className="w-full bg-navy-deep text-white/70 mt-6">
      <div className="w-full px-6 py-6 flex flex-col gap-5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-white/10 text-signal-bright flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">radar</span>
            </span>
            <div className="font-display text-sm font-bold text-white">
              TRINETRA
              <span className="ml-2 text-[10px] font-semibold text-white/40 tracking-[0.18em] uppercase">
                National Surveillance Grid
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.14em] uppercase text-white/40">
            <span>Ministry of Home Affairs</span>
            <span className="w-1 h-1 rounded-full bg-signal-bright" />
            <span>Smart India Hackathon 2026</span>
            <span className="w-1 h-1 rounded-full bg-signal-bright" />
            <span>Authorized Access Only</span>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px]">
          <div className="text-center md:text-left max-w-md">{info.project}</div>

          <div className="flex flex-wrap items-center gap-2">
            {info.stack.map((tech) => (
              <span
                key={tech}
                className="px-2 py-0.5 rounded bg-white/5 text-white/55 border border-white/10"
              >
                {tech}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-signal-bright">call</span>
              {info.helpline}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-signal/15 text-signal-bright font-bold">
              {info.version}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}