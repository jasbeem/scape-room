import React, { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { Typewriter } from './components/Typewriter';
import { SectorModal } from './components/SectorModal';
import { parseCSV } from './utils/csvParser';
import { GameState, SectorState, SQUADS, SquadAnimal } from './types';

const MUSIC_URL = "https://cdn.pixabay.com/audio/2023/12/03/audio_82c610484a.mp3";

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
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [activeSectorId, setActiveSectorId] = useState<number | null>(null);
  const [vaultInputs, setVaultInputs] = useState<string[]>(['', '', '', '', '']);
  const [missionStartTime, setMissionStartTime] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const adminConnectionsRef = useRef<DataConnection[]>([]);
  const adminStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(MUSIC_URL);
    audioRef.current.loop = true;
    audioRef.current.volume = 0.2;
    return () => { if (audioRef.current) audioRef.current.pause(); };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isMuted) audioRef.current.pause();
    else audioRef.current.play().catch(() => console.log("Interacción requerida para audio."));
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

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startHosting = () => {
    if (!keywordInput || !csvFile) {
      setErrorMsg("DATOS INCOMPLETOS");
      return;
    }
    const shortId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const peer = new Peer(`scaperoom-host-${shortId}`);
    
    peer.on('open', () => {
      setGameState(prev => ({ 
        ...prev, role: 'admin', stage: 'admin-lobby', roomId: shortId, adminKeyword: keywordInput.toUpperCase() 
      }));
    });

    peer.on('connection', (conn) => {
      adminConnectionsRef.current.push(conn);
      conn.on('data', (data: any) => {
        if (data.type === 'REQUEST_SQUAD') {
          setGameState(prev => {
            if (prev.connectedSquads.includes(data.squadName)) {
              conn.send({ type: 'SQUAD_DENIED' });
              return prev;
            }
            conn.send({ type: 'SQUAD_ACCEPTED' });
            const newSquads = [...prev.connectedSquads, data.squadName];
            adminConnectionsRef.current.forEach(c => c.send({ type: 'SYNC_SQUADS', taken: newSquads }));
            return { ...prev, connectedSquads: newSquads };
          });
        }
        if (data.type === 'SQUAD_FINISHED') {
          const duration = Date.now() - (adminStartTimeRef.current || Date.now());
          setGameState(prev => ({
            ...prev,
            finishedSquads: [...prev.finishedSquads, { name: data.squadName, time: duration }]
          }));
        }
      });
    });
    peerRef.current = peer;
  };

  const handleStartMission = async () => {
    if (!csvFile) return;
    const text = await csvFile.text();
    const allQuestions = parseCSV(text);
    const totalSectors = 5;
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    const chunkSize = Math.ceil(shuffled.length / totalSectors);
    const sectors: SectorState[] = [];
    
    for(let i=0; i<totalSectors; i++) {
      sectors.push({
        id: i + 1,
        name: `SECTOR_0${i+1}`,
        isLocked: false,
        lockoutEndTime: null,
        isSolved: false,
        questions: shuffled.slice(i*chunkSize, (i+1)*chunkSize),
        currentQuestionIndex: 0,
        accessCode: Math.floor(Math.random() * 90 + 10).toString()
      });
    }

    const payload = { keyword: gameState.adminKeyword, sectors };
    adminConnectionsRef.current.forEach(c => c.send({ type: 'START_MISSION', payload }));
    adminStartTimeRef.current = Date.now();
    setGameState(prev => ({ ...prev, stage: 'admin-monitor' }));
  };

  const connectToRoom = () => {
    if (!joinRoomId) return;
    setIsConnecting(true);
    const peer = new Peer();
    peer.on('open', () => {
      const conn = peer.connect(`scaperoom-host-${joinRoomId.toUpperCase()}`);
      conn.on('open', () => { connRef.current = conn; });
      conn.on('data', (data: any) => {
        if (data.type === 'SYNC_SQUADS') {
          setIsConnecting(false);
          setGameState(prev => ({ ...prev, role: 'squad', stage: 'squad-selection', takenSquads: data.taken }));
        }
        if (data.type === 'SQUAD_ACCEPTED') setGameState(prev => ({ ...prev, stage: 'squad-lobby' }));
        if (data.type === 'START_MISSION') {
          setGameState(prev => ({ 
            ...prev, 
            stage: 'squad-intro', 
            adminKeyword: data.payload.keyword, 
            sectors: data.payload.sectors 
          }));
        }
      });
    });
    peerRef.current = peer;
  };

  const selectSquad = (name: SquadAnimal) => {
    if (connRef.current) connRef.current.send({ type: 'REQUEST_SQUAD', squadName: name });
    setGameState(prev => ({ ...prev, squadAnimal: name }));
  };

  const AudioToggle = () => (
    <button onClick={toggleAudio} className={`fixed top-4 right-4 z-[100] p-3 border-2 transition-all flex items-center gap-2 font-mono text-xs ${isMuted ? 'border-cyber-red/50 text-cyber-red/50 hover:text-cyber-red hover:border-cyber-red' : 'border-cyber-green text-cyber-green shadow-[0_0_10px_#00ff41] hover:bg-cyber-green/10'}`}>
      {isMuted ? '🔇 AUDIO_OFF' : '🔊 AUDIO_ON'}
    </button>
  );

  if (gameState.stage === 'selection') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 font-mono bg-cyber-black relative overflow-hidden text-center">
        <AudioToggle />
        <div className="absolute inset-0 bg-[url('https://cdn.pixabay.com/photo/2018/06/06/11/47/technology-3457279_1280.jpg')] opacity-10 bg-cover bg-center"></div>
        <h1 className="text-6xl md:text-8xl font-black text-cyber-green glitch-effect mb-12 uppercase tracking-tighter">SCAPE ROOM</h1>
        <div className="flex flex-col md:flex-row gap-8 z-10">
          <button onClick={() => setGameState(p => ({...p, stage: 'admin-setup'}))} className="px-8 py-4 border-2 border-cyber-green text-cyber-green text-2xl font-bold hover:bg-cyber-green hover:text-black transition-all">ADMINISTRADOR</button>
          <button onClick={() => setGameState(p => ({...p, stage: 'squad-setup'}))} className="px-8 py-4 border-2 border-cyber-blue text-cyber-blue text-2xl font-bold hover:bg-cyber-blue hover:text-black transition-all">ESCUADRÓN</button>
        </div>
        <div className="mt-12 z-10">
          <button onClick={downloadExampleCSV} className="text-cyber-blue hover:text-white underline uppercase tracking-widest bg-black/60 px-6 py-3 border border-cyber-blue/30 text-xs">
            [ Descargar CSV de ejemplo ]
          </button>
        </div>
      </div>
    );
  }

  if (gameState.stage === 'admin-setup') {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center font-mono bg-black relative">
        <AudioToggle />
        <div className="w-full max-w-lg border border-cyber-green p-8 bg-black/80 shadow-[0_0_20px_rgba(0,255,65,0.1)]">
          <h2 className="text-2xl text-cyber-green mb-6 border-b border-cyber-green pb-2 uppercase tracking-tighter font-bold">Configuración</h2>
          <div className="mb-6 text-left">
            <label className="block text-cyber-blue mb-2 uppercase text-xs font-bold">Palabra Clave Final</label>
            <input type="text" className="w-full bg-black border border-cyber-green p-3 text-white outline-none focus:border-white transition-colors uppercase" placeholder="EJ: ATOMO" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} />
          </div>
          <div className="mb-6 text-left">
            <label className="block text-cyber-blue mb-2 uppercase text-xs font-bold">Archivo CSV (.csv)</label>
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files ? e.target.files[0] : null)} className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-cyber-green file:text-black cursor-pointer" />
          </div>
          {errorMsg && <p className="text-cyber-red mb-4 text-xs uppercase">{errorMsg}</p>}
          <button onClick={startHosting} className="w-full bg-cyber-green text-black font-bold py-3 hover:bg-white transition-colors uppercase">Iniciar Servidor</button>
          <button onClick={() => setGameState(p => ({...p, stage: 'selection'}))} className="w-full mt-4 text-gray-500 hover:text-white text-xs uppercase">[ Volver ]</button>
        </div>
      </div>
    );
  }

  if (gameState.stage === 'admin-lobby') {
    return (
      <div className="min-h-screen p-8 font-mono bg-black text-cyber-green relative">
        <AudioToggle />
        <div className="max-w-4xl mx-auto">
          <header className="mb-8 border-b border-cyber-green pb-4 flex justify-between items-end">
            <h1 className="text-4xl font-bold uppercase tracking-tighter">SALA DE CONTROL</h1>
            <div className="text-right">
              <p className="text-cyber-blue text-xs uppercase font-bold">Código Enlace</p>
              <p className="text-4xl font-black bg-cyber-green/10 px-4 border border-cyber-green">{gameState.roomId}</p>
            </div>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border border-cyber-green/50 p-6 bg-cyber-green/5">
              <h3 className="text-cyber-blue mb-6 uppercase font-bold text-sm tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-cyber-blue rounded-full animate-ping"></span>
                Escuadrones
              </h3>
              <ul className="space-y-3">
                {gameState.connectedSquads.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 uppercase text-lg font-bold border-l-2 border-cyber-green pl-4">
                    <span className="text-cyber-green">▶</span> {s}
                  </li>
                ))}
                {gameState.connectedSquads.length === 0 && <li className="text-gray-600 italic uppercase text-xs">Esperando agentes...</li>}
              </ul>
            </div>
            <div className="flex flex-col justify-center items-center border border-cyber-green/50 p-8 bg-black/40">
              <button onClick={handleStartMission} className="px-12 py-6 bg-cyber-green text-black font-bold text-2xl hover:scale-105 transition-transform uppercase">Lanzar Misión</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.stage === 'admin-monitor') {
    return (
      <div className="min-h-screen p-8 font-mono bg-black text-white relative">
        <AudioToggle />
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold text-cyber-green mb-12 uppercase tracking-tighter">Monitorización</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="border border-cyber-gold p-6 bg-cyber-gold/5">
              <h2 className="text-cyber-gold mb-8 uppercase font-bold">Finalizados</h2>
              <div className="space-y-4">
                {gameState.finishedSquads.map((s, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-cyber-gold/10 py-3">
                    <span className="uppercase font-bold">{s.name}</span>
                    <span className="text-cyber-gold font-mono">{formatTime(s.time)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-cyber-blue p-6 bg-cyber-blue/5">
              <h2 className="text-cyber-blue mb-8 uppercase font-bold">En Campo</h2>
              <div className="space-y-3">
                {gameState.connectedSquads.filter(s => !gameState.finishedSquads.find(f => f.name === s)).map(s => (
                  <div key={s} className="py-2 uppercase text-gray-400 flex items-center gap-3">
                    <span className="w-2 h-2 bg-cyber-blue rounded-full animate-pulse"></span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.stage === 'squad-setup') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black font-mono relative">
        <AudioToggle />
        <h2 className="text-3xl text-cyber-blue mb-8 uppercase tracking-widest font-bold">Enlace</h2>
        <div className="w-full max-w-xs space-y-4">
          <input type="text" placeholder="ID SALA" maxLength={5} value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())} className="w-full bg-black border-2 border-cyber-blue p-4 text-center text-2xl text-white outline-none uppercase" />
          <button onClick={connectToRoom} className="w-full bg-cyber-blue text-black font-bold py-4 text-xl hover:bg-white transition-colors uppercase">{isConnecting ? 'CONECTANDO...' : 'CONECTAR'}</button>
          <button onClick={() => setGameState(p => ({...p, stage: 'selection'}))} className="w-full text-gray-500 hover:text-white text-xs uppercase mt-4">[ CANCELAR ]</button>
        </div>
      </div>
    );
  }

  if (gameState.stage === 'squad-selection') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-black font-mono relative">
        <AudioToggle />
        <h2 className="text-3xl text-cyber-blue mb-8 uppercase font-bold">Identifícate</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
          {SQUADS.map((s) => {
            const taken = gameState.takenSquads.includes(s.name);
            return (
              <button key={s.name} onClick={() => selectSquad(s.name)} disabled={taken} className={`p-6 border-2 flex flex-col items-center gap-3 transition-all ${taken ? 'opacity-20 grayscale border-gray-800 cursor-not-allowed' : 'border-gray-700 hover:border-cyber-blue hover:bg-cyber-blue/5'}`}>
                <span className="text-5xl">{s.icon}</span>
                <span className="font-bold uppercase text-xs tracking-widest">{s.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (gameState.stage === 'squad-lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-black font-mono text-center relative">
        <AudioToggle />
        <div className="w-full max-w-md border border-cyber-green/30 bg-cyber-green/5 p-12">
          <div className="text-6xl mb-8 animate-bounce">⏳</div>
          <h2 className="text-2xl font-bold text-cyber-green mb-4 uppercase">ESCUADRÓN {gameState.squadAnimal}</h2>
          <p className="text-cyber-blue animate-pulse uppercase font-bold text-sm tracking-widest">Esperando señal de inicio...</p>
        </div>
      </div>
    );
  }

  if (gameState.stage === 'squad-intro') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-black font-mono relative">
        <AudioToggle />
        <div className="max-w-2xl border border-cyber-green p-10 bg-black">
          <Typewriter text={`>>> ATENCIÓN ESCUADRÓN ${gameState.squadAnimal}.\n\nSeguridad comprometida. Desbloquead los 5 sectores para obtener los códigos de acceso a la bóveda.\n\nEL TIEMPO CORRE.`} speed={25} className="text-lg text-cyber-green whitespace-pre-wrap mb-10 leading-relaxed font-bold uppercase" />
          <button onClick={() => { setMissionStartTime(Date.now()); setGameState(p => ({...p, stage: 'squad-game'})); }} className="px-10 py-4 bg-cyber-green text-black font-bold uppercase hover:bg-white transition-colors">Aceptar Misión</button>
        </div>
      </div>
    );
  }

  if (gameState.stage === 'squad-game') {
    const activeSector = gameState.sectors.find(s => s.id === activeSectorId);
    return (
      <div className="min-h-screen bg-black text-white font-mono p-4 md:p-8 flex flex-col md:flex-row gap-8 relative">
        <AudioToggle />
        <div className="flex-1">
          <header className="mb-8 border-b border-cyber-green/30 pb-4 flex justify-between items-center">
            <h1 className="text-3xl font-bold text-cyber-green uppercase tracking-tighter">Panel Operativo</h1>
            <div className="text-right">
              <p className="text-cyber-blue font-bold uppercase text-[10px] tracking-widest mb-1">{gameState.squadAnimal}</p>
              <p className="text-2xl font-black text-cyber-green bg-cyber-green/10 px-3 py-1 border border-cyber-green">
                {missionStartTime ? formatTime(Date.now() - missionStartTime) : "00:00"}
              </p>
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {gameState.sectors.map((s) => (
              <div key={s.id} onClick={() => !s.isSolved && setActiveSectorId(s.id)} className={`border-2 p-6 cursor-pointer transition-all ${s.isSolved ? 'border-cyber-green bg-cyber-green/20' : 'border-cyber-blue/50 hover:bg-cyber-blue/10 hover:border-cyber-blue'}`}>
                <div className="flex justify-between uppercase font-bold text-xs tracking-widest mb-4">
                  <span>{s.name}</span>
                  <span className={s.isSolved ? 'text-cyber-green' : 'text-cyber-blue'}>{s.isSolved ? '✔ ONLINE' : '⦿ LOCKED'}</span>
                </div>
                <div className="mt-2 text-4xl font-black">{s.isSolved ? s.accessCode : '--'}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full md:w-80 border-l border-cyber-green/30 md:pl-8 pt-8 md:pt-0">
          <div className="border-2 border-cyber-blue p-6 bg-cyber-blue/5">
            <h2 className="text-xl text-cyber-blue font-bold mb-8 uppercase tracking-widest border-b border-cyber-blue/30 pb-2">Bóveda</h2>
            <div className="space-y-5">
              {vaultInputs.map((val, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold text-gray-500">SEC_0{idx+1}</label>
                  <input type="text" maxLength={2} value={val} onChange={(e) => { const n = [...vaultInputs]; n[idx] = e.target.value; setVaultInputs(n); }} className="w-14 bg-black border border-gray-700 text-center py-2 outline-none focus:border-cyber-green text-xl font-bold transition-all" />
                </div>
              ))}
              <button onClick={() => {
                if (gameState.sectors.every((s, i) => vaultInputs[i] === s.accessCode)) {
                  if (connRef.current) connRef.current.send({ type: 'SQUAD_FINISHED', squadName: gameState.squadAnimal! });
                  setGameState(p => ({...p, stage: 'squad-win'}));
                } else alert("ACCESO DENEGADO");
              }} className="w-full mt-8 bg-cyber-blue text-black font-bold py-4 uppercase hover:bg-white transition-colors">Desbloquear</button>
            </div>
          </div>
        </div>
        {activeSector && (
          <SectorModal 
            sector={activeSector} 
            isOpen={!!activeSector} 
            onSectorSolved={(id) => { 
              setGameState(p => ({...p, sectors: p.sectors.map(s => s.id === id ? {...s, isSolved: true} : s)})); 
              setActiveSectorId(null); 
            }} 
            onSectorLocked={() => setActiveSectorId(null)} 
          />
        )}
      </div>
    );
  }

  if (gameState.stage === 'squad-win') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-black text-center font-mono relative">
        <AudioToggle />
        <div className="border-4 border-cyber-green p-16 bg-cyber-green/10 shadow-[0_0_60px_#00ff41] relative overflow-hidden">
          <h2 className="text-6xl font-black text-cyber-green mb-10 uppercase tracking-tighter glitch-effect">¡MISIÓN ÉXITO!</h2>
          <p className="text-cyber-blue mb-6 uppercase text-sm font-bold tracking-[0.4em]">Clave Decriptada:</p>
          <div className="text-7xl bg-cyber-green text-black font-black py-8 px-12 mb-10 border-4 border-white shadow-[0_0_30px_#fff]">
            {gameState.adminKeyword}
          </div>
          <p className="text-white animate-pulse uppercase font-black text-xl">¡Comunícala al Admin!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-mono">
      <div className="text-cyber-red animate-pulse">ERROR DE ESTADO // REINICIANDO...</div>
    </div>
  );
}

export default App;