import { useState } from "react";
import { searchPanel } from "../data/mockData";

/**
 * Track
 * Vehicle-search panel. `onSearch` is called with the current plate + tab
 * so you can wire this up to real search logic without touching markup.
 */
export default function Track({ panel = searchPanel, onSearch = () => {} }) {
  const [activeTab, setActiveTab] = useState(panel.tabs[0]);
  const [plate, setPlate] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch({ plate, mode: activeTab });
  };

  return (
    <section
      id="vehicle-search"
      className="bg-[#f0f4fa] rounded-xl p-6 shadow-sm space-y-4 border border-blue-100"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-navy text-white flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-[24px]">
              manage_search
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {panel.heading}
            </h2>
            <p className="text-xs text-slate-500">{panel.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg shadow-sm">
          {panel.tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab
                  ? "bg-navy text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative flex flex-col md:flex-row items-stretch gap-2 bg-white p-1.5 rounded-xl shadow-sm"
      >
        <div className="relative flex-1 flex items-center">
          <span className="material-symbols-outlined absolute left-3.5 text-[22px] text-slate-400">
            search
          </span>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="w-full pl-11 pr-4 py-3 bg-transparent text-slate-900 font-semibold placeholder:text-slate-400 placeholder:font-normal focus:outline-none uppercase tracking-wider"
            placeholder={panel.placeholder}
            type="text"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 rounded-lg bg-navy hover:bg-navy-dark text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          Search Trajectory
          <span className="material-symbols-outlined text-[18px]">
            arrow_forward
          </span>
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-slate-500 text-sm pt-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-navy">
            info
          </span>
          <span>{panel.helperText}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Recent Quick Lookups:</span>
          {panel.recentLookups.map((p) => (
            <button
              key={p}
              onClick={() => setPlate(p)}
              className="px-1.5 py-0.5 rounded bg-white font-mono text-slate-900 font-semibold shadow-sm hover:bg-slate-50"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
