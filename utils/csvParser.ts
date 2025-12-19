import { Question } from '../types';

export const parseCSV = (csvText: string): Question[] => {
  const lines = csvText.trim().split('\n');
  const questions: Question[] = [];

  // Skip header if it exists (heuristic check)
  const startIndex = lines[0].toLowerCase().includes('tipo') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle CSV parsing considering potential quotes
    // Simple split by semicolon; for more complex CSVs, a dedicated library is better.
    // We strip quotes if they exist around the value.
    const parts = line.split(';').map(p => p.trim().replace(/^"|"$/g, ''));

    if (parts.length < 8) continue; // Invalid row

    // CSV Format: Tipo;Pregunta;Op1;Op2;Op3;Op4;Tiempo;IndiceCorrecto;ImagenURL
    const type = parts[0];
    const questionText = parts[1];
    const options = [parts[2], parts[3], parts[4], parts[5]].filter(o => o !== ''); // Ensure we capture valid options
    const timeLimit = parseInt(parts[6], 10) || 45;
    
    // Correct index from CSV is likely 1-based (R1, R2...), converting to 0-based.
    // If the CSV provides "2", it means Op2.
    const correctIndexRaw = parseInt(parts[7], 10);
    const correctIndex = isNaN(correctIndexRaw) ? 0 : correctIndexRaw - 1;

    const imageUrl = parts[8] || undefined;

    questions.push({
      id: `q-${i}`,
      type,
      question: questionText,
      options,
      timeLimit,
      correctIndex,
      imageUrl
    });
  }

  return questions;
};