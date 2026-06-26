import { Star } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";

interface RatingSystemProps {
  onRate: (rating: number) => void;
  vetName: string;
}

export const RatingSystem = ({ onRate, vetName }: RatingSystemProps) => {
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4 max-w-[85%] self-start"
    >
      <p className="text-[11px] font-bold text-gray-700 mb-3 uppercase tracking-wider">
        Rate your session with {vetName}
      </p>
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(null)}
            onClick={() => {
              setSelected(star);
              onRate(star);
            }}
            className="transition-transform active:scale-90"
          >
            <Star
              className={cn(
                "w-6 h-6 transition-colors",
                (hover || selected || 0) >= star
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-gray-100 text-gray-200"
              )}
            />
          </button>
        ))}
      </div>
      <p className="text-[9px] text-gray-400 italic">
        "Your feedback helps us maintain the highest care standards."
      </p>
    </motion.div>
  );
};
