import React from 'react';
import { X, Award, Flame, Zap, ShieldAlert } from 'lucide-react';

interface PoseGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PoseGuideModal: React.FC<PoseGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const poses = [
    {
      title: "Front Double Bicep",
      icon: <Award className="w-5 h-5 text-amber-400" />,
      difficulty: "Classic",
      desc: "Raise both elbows horizontal with your shoulders. Flex both arms at 90° (70°-110°) with wrists above elbows.",
      tip: "Elbows up, flex biceps hard, keep chest proud."
    },
    {
      title: "Zyzz / Archer Pose",
      icon: <Flame className="w-5 h-5 text-amber-400" />,
      difficulty: "Legendary",
      desc: "Extend one arm straight outward like drawing a bow. Bring the opposite arm flexed behind or near your head.",
      tip: "Channel your inner aesthetics god. Hold strong for 250ms."
    },
    {
      title: "Lat Spread",
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      difficulty: "Power",
      desc: "Place both hands on your hips or waist. Flare your elbows wide out to expand your back silhouette.",
      tip: "Elbows wide, hands locked on hips."
    },
    {
      title: "Any Flex",
      icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
      difficulty: "Instant",
      desc: "Raise either hand above your shoulder with elbow flexed. Perfect for single arm bicep curls or quick flexes.",
      tip: "Fastest way to trigger the ethereal divine filter."
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl glass-panel p-6 border border-amber-500/30 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <h2 className="font-cinzel text-xl font-bold tracking-wide text-amber-300">
              Majestic Pose Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-white/70 mt-3 mb-5">
          Hold any pose steadily for 250ms to activate the divine celestial shader and viral angelic harp arpeggios.
        </p>

        <div className="space-y-3.5">
          {poses.map((p, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-amber-400/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {p.icon}
                  <span className="font-semibold text-sm sm:text-base text-white">
                    {p.title}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {p.difficulty}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/80 leading-relaxed mb-1.5">
                {p.desc}
              </p>
              <p className="text-[11px] text-amber-300/80 font-medium">
                💡 <span className="italic">{p.tip}</span>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold text-sm tracking-wide shadow-lg shadow-amber-500/20 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Ready to Flex
          </button>
        </div>
      </div>
    </div>
  );
};
