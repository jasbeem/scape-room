import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { Typewriter } from './components/Typewriter';
import { SectorModal } from './components/SectorModal';
import { parseCSV } from './utils/csvParser';
import { GameState, SectorState, PeerMessage, SQUADS, SquadAnimal } from './types';

const MUSIC_URL = "https://cdn.pixabay.com/audio/2023/12/03/audio_82c610484a.mp3"; // Lo-fi Cyberpunk track

const EXAMPLE_CSV_CONTENT = `Tipo;Pregunta;R1;R2;R3;R4;Tiempo;Correcta;URL Imagen
quiz;¿Qué operador repite cadenas en Python?;\*  ;x;repeat();\**;30;1;
quiz;¿Qué método especial se ejecuta al crear un objeto?;\_\_init\_\_;\_\_start\_\_;constructor;\_\_new\_\_;30;1;
quiz;¿Qué operador concatena cadenas en Python?;\+  ;concat();join;.;30;1;
quiz;¿Qué operador verifica "mayor o igual que" en Python?>;\>=;= >;mayor_igual;ge();30;1;
quiz;¿Cómo se escribe un comentario de una línea en Python?;\#;//;--;/*;20;1;
quiz;¿Sobre qué itera normalmente un bucle for en Python?;Secuencias;Solo números;Condiciones booleanas;Solo cadenas;30;1;
quiz;¿Cómo se definen cadenas de múltiples líneas en Python?;Triples comillas;Comillas simples con \\n;Corchetes con saltos;Paréntesis con comas;30;1;
quiz;¿Cuál es una característica principal de Python?;Interpretado;Compilado estáticamente;Solo soporta POO;Exclusivo de Windows;30;1;
quiz;¿Qué es una clase en POO según el material?;Plantilla;Instancia concreta;Variable global;Función especial;30;1;
quiz;¿Qué función convierte cualquier valor a cadena?;str();string();toString();to_str();30;1;
quiz;¿Qué palabra clave define una función en Python?;def;function;func;define;20;1;
quiz;¿Qué estructura de datos almacena pares clave-valor?;Diccionario;Lista;Tupla;Conjunto;30;1;
quiz;¿Qué operador realiza división entera en Python?;//;/;div;%;30;1;
quiz;¿Qué significa elif en Python?;Else if;Else en if;End if;If else;30;1;
quiz;¿Qué tipo de dato devuelve input()?;Cadena;Entero;Depende;Lista de caracteres;30;1;
quiz;¿Qué hace range(5) en un bucle for?;0 a 4;1 a 5;0 a 5;5 números aleatorios;30;1;
quiz;¿Qué permite la herencia en POO?;Crear clases basadas en otras;Ocultar datos internos;Ejecutar múltiples métodos;Convertir objetos en clases;30;1;
quiz;¿Cómo se describen las listas en Python?;Ordenadas y modificables;Inmutables y ordenadas;No ordenadas y modificables;Solo almacenan números;30;1;
quiz;¿Qué operador verifica desigualdad en Python?;!=;=!;not=;ne();30;1;
quiz;¿Qué operador se usa para exponentes en Python?;**;^;exp();//;30;1;`;

function App() {
  const [gameState, setGameState] = useState<GameState>({
    stage: 'selection',
    role: null,
    roomId: '',
    adminKeyword: '',
    sectors: [],
    squadName: '',
    squadAnimal: null,
    connectedSquads: [],
    finishedSquads: [],
    takenSquads: []
  });

  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(MUSIC_URL);
    audioRef.current.loop = true;
    audioRef.current.volume = 0.3;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {
        console.log("Autoplay bloqueado. Esperando interacción del usuario.");
      });
    }
  }, [isMuted]);

  const toggleAudio = () => setIsMuted(!isMuted);

  const downloadExampleCSV = () => {
    const blob = new Blob([EXAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'ejemplo_scape_room.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (gameState.stage === 'selection') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cyber-black relative overflow-hidden font-mono text-center">
        {/* Floating Mute Button */}
        <button 
          onClick={toggleAudio}
          className={`fixed top-4 right-4 z-[100] p-3 border-2 transition-all flex items-center gap-2 ${
            isMuted 
              ? 'border-cyber-red/50 text-cyber-red/50 hover:border-cyber-red hover:text-cyber-red' 
              : 'border-cyber-green text-cyber-green shadow-[0_0_15px_#00ff41] hover:bg-cyber-green/10'
          }`}
        >
          {isMuted ? '🔇 AUDIO_OFF' : '🔊 AUDIO_ON'}
        </button>

        <div className="absolute inset-0 bg-[url('https://cdn.pixabay.com/photo/2018/06/06/11/47/technology-3457279_1280.jpg')] opacity-10 bg-cover bg-center"></div>
        <div className="z-10 space-y-8 p-4">
          <h1 className="text-6xl md:text-8xl font-black text-cyber-green glitch-effect font-mono mb-12 uppercase">
            SCAPE ROOM
          </h1>
          <div className="flex flex-col md:flex-row gap-8 justify-center items-center">
            <button 
              onClick={() => setGameState(prev => ({...prev, role: 'admin', stage: 'admin-setup'}))}
              className="group relative px-8 py-4 bg-transparent border-2 border-cyber-green text-cyber-green font-mono text-2xl font-bold hover:bg-cyber-green hover:text-black transition-all duration-300 w-72 uppercase"
            >
              ADMINISTRADOR
            </button>
            <button 
              onClick={() => setGameState(prev => ({...prev, role: 'squad', stage: 'squad-setup'}))}
              className="group relative px-8 py-4 bg-transparent border-2 border-cyber-blue text-cyber-blue font-mono text-2xl font-bold hover:bg-cyber-blue hover:text-black transition-all duration-300 w-72 uppercase"
            >
              ESCUADRÓN
            </button>
          </div>
          <div className="pt-8">
            <button 
                onClick={downloadExampleCSV}
                className="text-sm text-cyber-blue hover:text-white underline decoration-dotted transition-all font-mono uppercase tracking-widest bg-black/40 px-6 py-3 border border-cyber-blue/30"
            >
                [ Descargar CSV de ejemplo ]
            </button>
            <p className="mt-2 text-[10px] text-gray-500 uppercase tracking-widest">Utiliza esta plantilla para cargar tus propias preguntas</p>
          </div>
        </div>
      </div>
    );
  }

  // Resto de la lógica del componente App...
  return null;
}

export default App;