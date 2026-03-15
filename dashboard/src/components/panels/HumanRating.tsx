import { useState } from 'react';
import { Star } from 'lucide-react';
import { Panel } from '../ui/Panel';

interface HumanRatingProps {
  currentIteration: number;
  onRate: (iterationId: number, rating: number) => void;
  lastRatedIteration?: number;
}

export function HumanRating({ currentIteration, onRate, lastRatedIteration }: HumanRatingProps) {
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const alreadyRated = lastRatedIteration === currentIteration;

  const handleRate = (rating: number) => {
    setSelectedRating(rating);
    onRate(currentIteration, rating);
  };

  return (
    <Panel
      title="Judge Rating"
      icon={<Star size={14} className="text-yellow-400" />}
    >
      <div className="flex flex-col items-center gap-2 py-2">
        <span className="text-[10px] text-niwa-text-muted uppercase tracking-wider">
          Rate iteration #{currentIteration}
        </span>

        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => {
            const isActive = star <= (hoveredStar || selectedRating);
            return (
              <button
                key={star}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => handleRate(star)}
                disabled={alreadyRated}
                className={`p-1 transition-all duration-150 ${
                  alreadyRated ? 'cursor-default opacity-60' : 'cursor-pointer hover:scale-110'
                }`}
              >
                <Star
                  size={20}
                  className={isActive ? 'text-yellow-400 fill-yellow-400' : 'text-niwa-border'}
                />
              </button>
            );
          })}
        </div>

        {alreadyRated && (
          <span className="text-[9px] text-niwa-positive">
            Rated {selectedRating}/5
          </span>
        )}

        <p className="text-[8px] text-niwa-text-muted text-center max-w-[200px]">
          Your rating trains the RL policy alongside the Critic's scores
        </p>
      </div>
    </Panel>
  );
}
