import React, { useState, useEffect } from 'react';
import { SectorState } from '../types';

interface SectorModalProps {
  sector: SectorState;
  isOpen: boolean;
  onSectorSolved: (sectorId: number) => void;
  onSectorLocked: (sectorId: number) => void;
}

export const SectorModal: React.FC<SectorModalProps> = ({ sector, isOpen, onSectorSolved, onSectorLocked }) => {
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'neutral' | 'correct' | 'wrong'>('neutral');

  // Reset state when modal opens or sector changes
  useEffect(() => {
    if (isOpen) {
      setQIndex(sector.currentQuestionIndex);
      setFeedback('neutral');
      setSelectedOption(null);
    }
  }, [isOpen, sector]);

  if (!isOpen) return null;
  if (sector.isLocked) return null; // Should be handled by parent, but safety check

  const currentQ = sector.questions[qIndex];

  // If no more questions, or something wrong
  if (!currentQ) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <div className="border border-cyber-red text-cyber-red p-8 font-mono text-xl animate-pulse">
          ERROR: DATOS DE SECTOR NO ENCONTRADOS
        </div>
      </div>
    );
  }

  const handleOptionClick = (index: number) => {
    if (feedback !== 'neutral') return; // Prevent double clicks
    setSelectedOption(index);

    if (index === currentQ.correctIndex) {
      setFeedback('correct');
      setTimeout(() => {
        if (qIndex + 1 < sector.questions.length) {
          setQIndex(prev => prev + 1);
          setFeedback('neutral');
          setSelectedOption(null);
        } else {
            // All questions solved
            onSectorSolved(sector.id);
        }
      }, 1000);
    } else {
      setFeedback('wrong');
      setTimeout(() => {
        onSectorLocked(sector.id); // Triggers lock in parent
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-cyber-black bg-opacity-95 p-4">
      <div className="w-full max-w-2xl border-2 border-cyber-green shadow-[0_0_20px_rgba(0,255,65,0.3)] bg-black p-6 relative overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 border-b border-cyber-green/30 pb-2">
          <h2 className="text-2xl font-bold font-mono text-cyber-green">
            SECTOR {sector.id} // PREGUNTA {qIndex + 1}/{sector.questions.length}
          </h2>
          <div className="text-cyber-blue text-sm animate-pulse">ENCRIPTACIÓN ACTIVA</div>
        </div>

        {/* Question */}
        <div className="mb-8">
            {currentQ.imageUrl && (
                <div className="mb-4 border border-cyber-green/50 p-1">
                    <img src={currentQ.imageUrl} alt="Data Visual" className="w-full h-48 object-cover opacity-80" />
                </div>
            )}
            <p className="text-xl font-mono text-white mb-2 leading-relaxed">
            {currentQ.question}
            </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-4">
          {currentQ.options.map((opt, idx) => {
            let btnClass = "border border-cyber-green/50 p-4 text-left font-mono hover:bg-cyber-green/10 transition-colors text-cyber-green relative group";
            
            if (selectedOption === idx) {
              if (feedback === 'correct') btnClass = "border-2 border-cyber-green bg-cyber-green text-black font-bold";
              if (feedback === 'wrong') btnClass = "border-2 border-cyber-red bg-cyber-red/20 text-cyber-red";
            } else if (selectedOption !== null) {
                btnClass = "border border-gray-800 text-gray-600 opacity-50"; // Dim others
            }

            return (
              <button
                key={idx}
                onClick={() => handleOptionClick(idx)}
                className={btnClass}
                disabled={selectedOption !== null}
              >
                <span className="mr-4 opacity-50">&gt;</span>
                {opt}
                {/* Glitch hover effect */}
                <div className="absolute inset-0 bg-cyber-green opacity-0 group-hover:opacity-5 pointer-events-none"></div>
              </button>
            );
          })}
        </div>

        {/* Footer Status */}
        <div className="mt-6 flex justify-between text-xs text-cyber-blue font-mono uppercase">
           <span>ID: {currentQ.id}</span>
           <span>Time Limit: {currentQ.timeLimit}s (DISABLED IN PROTOCOL)</span>
        </div>
      </div>
    </div>
  );
};