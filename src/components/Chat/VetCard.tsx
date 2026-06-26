import { Star, MapPin, Clock, MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";

interface Vet {
  id: string;
  name: string;
  location: string;
  rating: number;
  ratingCount: number;
  availability: string;
  distance: string;
  lat?: number;
  lng?: number;
}

interface VetCardProps {
  vet: Vet;
  onSelect: (vet: Vet) => void;
  onSchedule?: (vet: Vet) => void;
  onLocate?: (vet: Vet) => void;
}

export const VetCard = ({ vet, onSelect, onSchedule, onLocate }: VetCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-50 rounded-xl border border-gray-200 p-3 mb-3 hover:border-rc-red/30 transition-colors cursor-pointer group"
      onClick={() => onSelect(vet)}
    >
      <div className="flex gap-3 mb-2.5">
        <div className="w-10 h-10 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center font-bold text-gray-400 overflow-hidden text-lg">
          {vet.name.includes("Dr. ") ? vet.name.split("Dr. ")[1].charAt(0) : vet.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold text-gray-900 group-hover:text-rc-red transition-colors">{vet.name}</p>
            <div className="flex items-center text-rc-red text-[10px] font-bold">
              <Star className="w-2.5 h-2.5 fill-rc-red mr-0.5" />
              {vet.rating}
            </div>
          </div>
          <p className="text-[9.5px] text-gray-500 font-medium">Canine Specialist • {vet.distance}</p>
          <div className="flex items-center text-yellow-500 text-[9.5px] mt-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={cn("w-2.5 h-2.5 mr-0.5", i < Math.floor(vet.rating) ? "fill-yellow-500" : "fill-gray-200 text-gray-200")} />
            ))}
            <span className="text-[8.5px] text-gray-400 ml-1 font-medium italic">({vet.ratingCount} reviews)</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[9px] text-[#4B5563] mb-2 font-medium">
        <MapPin className="w-3.5 h-3.5 text-rc-red/80" />
        <span className="truncate">{vet.location}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(vet);
          }}
          className="py-1.5 bg-rc-red text-white text-[9px] font-bold rounded-lg shadow-sm hover:bg-rc-red/90 transition-all uppercase tracking-wider block text-center cursor-pointer"
        >
          TALK NOW
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onSchedule?.(vet);
          }}
          className="py-1.5 bg-slate-800 text-white text-[9px] font-bold rounded-lg shadow-sm hover:bg-slate-700 transition-all uppercase tracking-wider block text-center cursor-pointer"
        >
          SCHEDULE CALL
        </button>

        {onLocate && (vet.lat && vet.lng) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLocate(vet);
            }}
            className="col-span-2 py-1 bg-green-50 border border-green-200 hover:bg-green-100 text-green-700 text-[8.5px] font-extrabold rounded-md shadow-inner transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer text-center"
          >
            <MapPin className="w-3 h-3 text-green-600 fill-green-200 animate-bounce" style={{ animationDuration: '2s' }} />
            Locate clinic on Map
          </button>
        )}
      </div>
    </motion.div>
  );
};
