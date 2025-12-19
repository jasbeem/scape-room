import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { Typewriter } from './components/Typewriter';
import { SectorModal } from './components/SectorModal';
import { parseCSV } from './utils/csvParser';
import { GameState, SectorState, PeerMessage, SQUADS, SquadAnimal } from './types';

// MissionIntro Component
const MissionIntro: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const [showButton, setShowButton] = useState(false);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 font-mono relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://cdn.pixabay.com/photo/2018/06/06/11/47/technology-3457279_1280.jpg')] opacity-5 bg-cover bg-center"></div>
      
      <div className="max-w-3xl w-full border border-cyber-green p-8 bg-black/90 shadow-[0_0_30px_rgba(0,255,65,0.2)] relative z-10 backdrop-blur-sm">
        <header className="flex justify-between items-end mb-8 border-b border-cyber-green/50 pb-4">
            <h1 className="text-3xl md:text-4xl font-bold text-cyber-green tracking-tighter">
                INFORME DE MISIÓN
            </h1>
            <div className="flex gap-2 items-center">
               <span className="w-2 h-2 bg-cyber-red rounded-full animate-ping"></span>
               <span className="text-cyber-red text-xs font-bold tracking-widest">CLASIFICADO</span>
            </div>
        </header>
          
        <div className="text-gray-300 text-lg md:text-xl leading-relaxed font-mono min-h-[240px] mb-6 whitespace-pre-line">
            <Typewriter 
              text={`ATENCIÓN AGENTES. La seguridad de la base ha sido comprometida. Su escuadrón tiene autorización temporal para acceder a los 5 sectores del núcleo. 

OBJETIVO:
1. Respondan correctamente las preguntas de cada sector.
2. Obtengan los fragmentos del código de acceso.
3. Ingresen los códigos en la Bóveda Maestra.

Una vez abierta la Bóveda, recibirán la CLAVE FINAL. El fracaso no es una opción. Buena suerte.`}
              speed={25}
              onComplete={() => setShowButton(true)}
            />
        </div>

        <div className="flex justify-end items-center h-20 border-t border-cyber-green/30 pt-6">
            {showButton ? (
              <button 
                onClick={onStart}
                className="bg-cyber-green text-black font-black px-10 py-4 text-xl hover:bg-white hover:scale-105 transition-all duration-200 shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              >
                ACEPTAR MISIÓN
              </button>
            ) : (
               <span className="text-cyber-green/50 animate-pulse text-sm">DECODIFICANDO MENSAJE...</span>
            )}
        </div>
      </div>
    </div>
  );
};

// Initial Mock/Empty State
const INITIAL_STATE: GameState = {
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
};

// PeerJS Helper to create clean IDs
const generateShortId = () => Math.random().toString(36).substring(2, 7).toUpperCase();

// Helper to format milliseconds to MM:SS
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

function App() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Admin specific state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  
  // Squad specific state
  const [joinRoomId, setJoinRoomId] = useState('');
  const [activeSectorId, setActiveSectorId] = useState<number | null>(null);
  const [vaultInputs, setVaultInputs] = useState<string[]>(['', '', '', '', '']);
  const [vaultMessage, setVaultMessage] = useState<string>('BLOQUEADO');
  const [finalRevealed, setFinalRevealed] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Networking refs
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]); // For Admin
  const adminConnRef = useRef<DataConnection | null>(null); // For Squad
  const adminStartTimeRef = useRef<number | null>(null); // To track mission duration on admin side

  // --- AUDIO EFFECTS (Simple beep) ---
  const playBeep = (freq = 440, type: OscillatorType = 'square') => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  // --- SECTOR LOGIC (Squad) ---
  const updateSectorLockout = useCallback(() => {
    setGameState(prev => {
        if (prev.role !== 'squad') return prev;
        const now = Date.now();
        let changed = false;
        
        const newSectors = prev.sectors.map(s => {
            if (s.isLocked && s.lockoutEndTime && now >= s.lockoutEndTime) {
                changed = true;
                return { ...s, isLocked: false, lockoutEndTime: null };
            }
            return s;
        });

        return changed ? { ...prev, sectors: newSectors } : prev;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(updateSectorLockout, 1000);
    return () => clearInterval(interval);
  }, [updateSectorLockout]);


  // --- NETWORKING SETUP ---

  // Broadcast function for Admin
  const broadcastSquadUpdate = (squads: string[]) => {
      connectionsRef.current.forEach(conn => {
          if (conn.open) {
            conn.send({ type: 'SYNC_SQUADS', taken: squads });
          }
      });
  };

  // Admin Start Hosting
  const startHosting = () => {
    if (!keywordInput || !csvFile) {
        setErrorMsg("FALTA ARCHIVO O PALABRA CLAVE");
        return;
    }

    const shortId = generateShortId();
    // Using a prefix to try and ensure uniqueness on public PeerServer
    const peer = new Peer(`scaperoom-host-${shortId}`);
    
    peer.on('open', (id) => {
      console.log('Host Open with ID:', id);
      setGameState(prev => ({ 
        ...prev, 
        role: 'admin', 
        stage: 'admin-lobby', 
        roomId: shortId,
        adminKeyword: keywordInput.toUpperCase() 
      }));
    });

    peer.on('connection', (conn) => {
      // Store connection immediately so we can broadcast to it
      connectionsRef.current.push(conn);
      
      conn.on('open', () => {
         // Send current list immediately on connection
         // Need to use ref or callback to get latest state in event handler
         setGameState(prev => {
             conn.send({ type: 'SYNC_SQUADS', taken: prev.connectedSquads });
             return prev;
         });
      });

      conn.on('data', (data: any) => {
        const msg = data as PeerMessage;
        
        if (msg.type === 'REQUEST_SQUAD') {
            setGameState(prev => {
                if (prev.connectedSquads.includes(msg.squadName)) {
                    conn.send({ type: 'SQUAD_DENIED' });
                    return prev;
                }
                
                // Success
                conn.send({ type: 'SQUAD_ACCEPTED' });
                playBeep(880);
                const newSquads = [...prev.connectedSquads, msg.squadName];
                
                // Broadcast new list to everyone
                broadcastSquadUpdate(newSquads);
                
                return { ...prev, connectedSquads: newSquads };
            });
        }
        
        if (msg.type === 'SQUAD_FINISHED') {
             const now = Date.now();
             const startTime = adminStartTimeRef.current || now;
             const duration = now - startTime;

             setGameState(prev => {
                 if (prev.finishedSquads.some(s => s.name === msg.squadName)) return prev;
                 playBeep(1200, 'triangle');
                 return {
                     ...prev,
                     finishedSquads: [...prev.finishedSquads, { name: msg.squadName, time: duration }]
                 };
             });
        }
      });

      // Cleanup on close
      conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
      });
    });

    peer.on('error', (err) => {
       console.error(err);
       setErrorMsg("ERROR DE RED: " + err.type);
    });

    peerRef.current = peer;
  };

  // Squad: Step 1 - Connect to Room
  const connectToRoom = () => {
    if (!joinRoomId) {
        setErrorMsg("INTRODUCE EL ID DE LA SALA");
        return;
    }
    
    setIsConnecting(true);
    setErrorMsg('');

    const peer = new Peer(); 
    peer.on('open', () => {
        const conn = peer.connect(`scaperoom-host-${joinRoomId.toUpperCase().trim()}`);
        
        conn.on('open', () => {
            adminConnRef.current = conn;
            // Connection established, wait for SYNC_SQUADS
        });

        conn.on('data', (data: any) => {
            const msg = data as PeerMessage;
            
            if (msg.type === 'SYNC_SQUADS') {
                setIsConnecting(false);
                setGameState(prev => ({ 
                    ...prev, 
                    role: 'squad', 
                    stage: 'squad-selection', // Move to selection screen
                    takenSquads: msg.taken 
                }));
            }
            
            if (msg.type === 'SQUAD_ACCEPTED') {
                 setGameState(prev => ({ ...prev, stage: 'squad-lobby' }));
            }
            
            if (msg.type === 'SQUAD_DENIED') {
                 setErrorMsg("¡ESCUADRÓN YA SELECCIONADO POR OTRO EQUIPO!");
                 // RESET SELECTION so they can pick again
                 setGameState(prev => ({ ...prev, squadAnimal: null }));
            }

            if (msg.type === 'START_MISSION') {
                setGameState(prev => ({
                    ...prev,
                    stage: 'squad-intro',
                    adminKeyword: msg.payload.keyword,
                    sectors: msg.payload.sectors
                }));
                playBeep(200);
            }
        });

        conn.on('error', (err) => {
            setIsConnecting(false);
            setErrorMsg("ERROR CONEXIÓN: ID NO ENCONTRADO");
        });
        
        conn.on('close', () => {
            setIsConnecting(false);
            // Optionally handle disconnect
        });
    });

    peer.on('error', (err) => {
        setIsConnecting(false);
        if (err.type === 'peer-unavailable') {
            setErrorMsg("SALA NO ENCONTRADA");
        } else {
            setErrorMsg("ERROR RED: " + err.type);
        }
    });

    peerRef.current = peer;
  };

  // Squad: Step 2 - Select Animal
  const selectSquad = (animal: SquadAnimal) => {
      if (gameState.takenSquads.includes(animal)) return;
      
      setGameState(prev => ({ ...prev, squadAnimal: animal }));
      // Request reservation
      if (adminConnRef.current) {
          adminConnRef.current.send({ type: 'REQUEST_SQUAD', squadName: animal });
      } else {
          setErrorMsg("CONEXIÓN PERDIDA");
          setGameState(prev => ({ ...prev, squadAnimal: null }));
      }
  };

  // Admin Start Game Logic
  const handleStartMission = async () => {
     if (!csvFile) return;
     
     const text = await csvFile.text();
     const allQuestions = parseCSV(text);
     
     // Shuffle and distribute
     const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
     const totalSectors = 5;
     const newSectors: SectorState[] = [];
     
     // Create chunks
     const chunkSize = Math.ceil(shuffled.length / totalSectors);
     
     for(let i=0; i<totalSectors; i++) {
        // Generate random 2-digit code
        const code = Math.floor(Math.random() * 90 + 10).toString();
        
        newSectors.push({
            id: i + 1,
            name: `SECTOR_0${i+1}`,
            isLocked: false,
            lockoutEndTime: null,
            isSolved: false,
            questions: shuffled.slice(i*chunkSize, (i+1)*chunkSize),
            currentQuestionIndex: 0,
            accessCode: code
        });
     }

     const payload = { keyword: gameState.adminKeyword, sectors: newSectors };
     
     // Broadcast
     connectionsRef.current.forEach(conn => {
         conn.send({ type: 'START_MISSION', payload });
     });

     // Set Admin Start Time Reference
     adminStartTimeRef.current = Date.now();

     setGameState(prev => ({ ...prev, stage: 'admin-monitor' }));
  };

  // --- GAMEPLAY HANDLERS ---

  const handleSectorClick = (id: number) => {
      const sector = gameState.sectors.find(s => s.id === id);
      if(sector && !sector.isLocked && !sector.isSolved) {
          setActiveSectorId(id);
      }
  };

  const handleSectorSolved = (id: number) => {
      setActiveSectorId(null);
      setGameState(prev => ({
          ...prev,
          sectors: prev.sectors.map(s => s.id === id ? { ...s, isSolved: true } : s)
      }));
      playBeep(600, 'sine');
  };

  const handleSectorLocked = (id: number) => {
    setActiveSectorId(null);
    const lockoutTime = Date.now() + 10000; // 10 seconds
    setGameState(prev => ({
        ...prev,
        sectors: prev.sectors.map(s => s.id === id ? { ...s, isLocked: true, lockoutEndTime: lockoutTime } : s)
    }));
    playBeep(150, 'sawtooth');
  };

  const handleVaultInput = (index: number, val: string) => {
      if (val.length > 2) return;
      const newInputs = [...vaultInputs];
      newInputs[index] = val;
      setVaultInputs(newInputs);
  };

  const attemptVaultUnlock = () => {
      // Collect codes from solved sectors
      let allCorrect = true;
      
      gameState.sectors.forEach((sec, idx) => {
          if (vaultInputs[idx] !== sec.accessCode) allCorrect = false;
      });

      if (allCorrect) {
          setFinalRevealed(true);
          setVaultMessage("ACCESO CONCEDIDO");
          playBeep(1000, 'sine');
          // NOTIFY ADMIN
          if (adminConnRef.current) {
              adminConnRef.current.send({ type: 'SQUAD_FINISHED', squadName: gameState.squadAnimal });
          }
      } else {
          setVaultMessage("ACCESO DENEGADO");
          playBeep(100, 'sawtooth');
          setTimeout(() => setVaultMessage("BLOQUEADO"), 2000);
      }
  };

  // --- MISSION TIMER (Local State) ---
  const [missionStartTime, setMissionStartTime] = useState<number | null>(null);
  
  // MEMOIZED to prevent unnecessary re-renders in MissionIntro
  const beginGame = useCallback(() => {
    setMissionStartTime(Date.now());
    setGameState(prev => ({...prev, stage: 'squad-game'}));
  }, []);

  // --- RENDERERS ---

  if (gameState.stage === 'selection') {
      return (
          <div className="min-h-screen flex items-center justify-center bg-cyber-black relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://cdn.pixabay.com/photo/2018/06/06/11/47/technology-3457279_1280.jpg')] opacity-10 bg-cover bg-center"></div>
              <div className="z-10 text-center space-y-8 p-4">
                  <h1 className="text-6xl md:text-8xl font-black text-cyber-green glitch-effect font-mono mb-12">
                      SCAPE ROOM
                  </h1>
                  <div className="flex flex-col md:flex-row gap-8 justify-center">
                      <button 
                        onClick={() => setGameState(prev => ({...prev, role: 'admin', stage: 'admin-setup'}))}
                        className="group relative px-8 py-4 bg-transparent border-2 border-cyber-green text-cyber-green font-mono text-2xl font-bold hover:bg-cyber-green hover:text-black transition-all duration-300 w-64"
                      >
                          <span className="absolute inset-0 w-full h-full bg-cyber-green/20 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
                          ADMINISTRADOR
                      </button>
                      <button 
                        onClick={() => setGameState(prev => ({...prev, role: 'squad', stage: 'squad-setup'}))}
                        className="group relative px-8 py-4 bg-transparent border-2 border-cyber-blue text-cyber-blue font-mono text-2xl font-bold hover:bg-cyber-blue hover:text-black transition-all duration-300 w-64"
                      >
                           <span className="absolute inset-0 w-full h-full bg-cyber-blue/20 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
                          ESCUADRÓN
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // --- NEW SQUAD SETUP FLOW ---
  
  // Step 1: Join Room (Connect)
  if (gameState.stage === 'squad-setup') {
      return (
          <div className="min-h-screen p-4 flex flex-col items-center justify-center font-mono bg-black">
              <h2 className="text-3xl text-cyber-blue mb-8">ENLACE AL SISTEMA</h2>
              <div className="w-full max-w-md space-y-4">
                  <input 
                    type="text" 
                    placeholder="ID DE SALA (5 LETRAS)" 
                    maxLength={5}
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                    className="w-full bg-black border-2 border-cyber-blue p-4 text-center text-2xl text-white tracking-[0.5em] focus:outline-none focus:border-cyber-green disabled:opacity-50"
                    disabled={isConnecting}
                  />
                  {errorMsg && <p className="text-cyber-red text-center">{errorMsg}</p>}
                  <button 
                    onClick={connectToRoom}
                    disabled={isConnecting}
                    className={`w-full text-black font-bold py-4 text-xl transition-colors ${isConnecting ? 'bg-gray-500 cursor-wait' : 'bg-cyber-blue hover:bg-white'}`}
                  >
                      {isConnecting ? 'CONECTANDO...' : 'CONECTAR'}
                  </button>
              </div>
          </div>
      );
  }

  // Step 2: Select Squad (Real-time updates)
  if (gameState.stage === 'squad-selection') {
      return (
          <div className="min-h-screen p-4 flex flex-col items-center justify-center font-mono bg-black">
              <h2 className="text-3xl text-cyber-blue mb-8">SELECCIONA TU UNIDAD</h2>
              <p className="text-gray-500 mb-6">Unidades en gris están ocupadas.</p>
              
              {/* REGISTERING OVERLAY */}
              {gameState.squadAnimal && (
                  <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm">
                      <div className="text-6xl mb-6 animate-pulse">
                          {SQUADS.find(s => s.name === gameState.squadAnimal)?.icon}
                      </div>
                      <h3 className="text-2xl text-cyber-green font-bold animate-pulse">
                          REGISTRANDO {gameState.squadAnimal}...
                      </h3>
                      <p className="text-cyber-blue mt-2 text-sm tracking-widest">ESTABLECIENDO ENLACE CON COMANDO</p>
                  </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {SQUADS.map((squad) => {
                      const isTaken = gameState.takenSquads.includes(squad.name);
                      // Disable interaction if already taken OR if we are currently registering one
                      const isDisabled = isTaken || gameState.squadAnimal !== null;
                      
                      return (
                          <button 
                            key={squad.name}
                            onClick={() => selectSquad(squad.name)}
                            disabled={isDisabled}
                            className={`p-4 border-2 flex flex-col items-center gap-2 transition-all 
                                ${isTaken 
                                    ? 'border-gray-800 bg-gray-900 opacity-30 cursor-not-allowed grayscale' 
                                    : 'border-gray-700 hover:border-cyber-blue hover:scale-105 hover:shadow-[0_0_15px_#00f3ff]'
                                }`}
                          >
                              <span className="text-4xl">{squad.icon}</span>
                              <span className={`font-bold ${isTaken ? 'text-gray-600' : 'text-gray-500'}`}>{squad.name}</span>
                          </button>
                      );
                  })}
              </div>
               {errorMsg && <p className="text-cyber-red text-center mb-4">{errorMsg}</p>}
          </div>
      );
  }

  // ... (Rest of Admin Views and Game Views remain the same, just checking stage names)

  if (gameState.stage === 'admin-setup') {
      // (Same as before)
      return (
          <div className="min-h-screen p-8 flex flex-col items-center justify-center font-mono">
              <div className="w-full max-w-lg border border-cyber-green p-8 bg-black/80 shadow-[0_0_15px_rgba(0,255,65,0.2)]">
                  <h2 className="text-2xl text-cyber-green mb-6 border-b border-cyber-green pb-2">CONFIGURACIÓN DE MISIÓN</h2>
                  
                  <div className="mb-6">
                      <label className="block text-cyber-blue mb-2">PALABRA CLAVE FINAL</label>
                      <input 
                        type="text" 
                        className="w-full bg-black border border-cyber-green p-3 text-white focus:outline-none focus:shadow-[0_0_10px_#00ff41]"
                        placeholder="EJ: ATOMO"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                      />
                  </div>

                  <div className="mb-6">
                      <label className="block text-cyber-blue mb-2">ARCHIVO DE DATOS (.CSV)</label>
                      <input 
                        type="file" 
                        accept=".csv"
                        onChange={(e) => setCsvFile(e.target.files ? e.target.files[0] : null)}
                        className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-cyber-green file:text-black hover:file:bg-green-400"
                      />
                  </div>

                  {errorMsg && <p className="text-cyber-red mb-4 animate-pulse">{errorMsg}</p>}

                  <button 
                    onClick={startHosting}
                    className="w-full bg-cyber-green text-black font-bold py-3 hover:bg-white transition-colors"
                  >
                      INICIAR SERVIDOR
                  </button>
              </div>
          </div>
      );
  }

  if (gameState.stage === 'admin-lobby') {
       return (
          <div className="min-h-screen p-8 font-mono bg-black text-cyber-green">
              <div className="max-w-4xl mx-auto">
                <header className="mb-8 border-b border-cyber-green pb-4 flex justify-between items-end">
                    <h1 className="text-4xl font-bold">SALA DE CONTROL</h1>
                    <div className="text-right">
                        <p className="text-cyber-blue text-sm">CÓDIGO DE ENLACE</p>
                        <p className="text-4xl font-black bg-cyber-green/10 px-4 py-1 border border-cyber-green">{gameState.roomId}</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="border border-cyber-green/50 p-4 min-h-[300px]">
                        <h3 className="text-cyber-blue mb-4 text-xl">ESCUADRONES CONECTADOS</h3>
                        <ul className="space-y-2">
                            {gameState.connectedSquads.length === 0 && <li className="text-gray-500 italic">Esperando señal...</li>}
                            {gameState.connectedSquads.map((sq, i) => (
                                <li key={i} className="flex items-center gap-2 text-xl">
                                    <span className="w-2 h-2 bg-cyber-green animate-pulse rounded-full"></span>
                                    {sq}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex flex-col justify-center items-center p-8 border border-cyber-green/50 bg-cyber-green/5">
                        <p className="mb-4 text-center">Una vez todos los escuadrones estén en línea, inicia la secuencia.</p>
                        <button 
                            onClick={handleStartMission}
                            className="px-12 py-6 bg-cyber-green text-black font-bold text-2xl hover:scale-105 transition-transform shadow-[0_0_20px_rgba(0,255,65,0.5)]"
                        >
                            INICIAR MISIÓN
                        </button>
                    </div>
                </div>
              </div>
          </div>
      );
  }

  if (gameState.stage === 'admin-monitor') {
      const activeSquads = gameState.connectedSquads.filter(s => !gameState.finishedSquads.some(f => f.name === s));
      
      return (
          <div className="min-h-screen p-8 font-mono bg-black text-white">
              <div className="max-w-6xl mx-auto">
                  <header className="mb-12 border-b-2 border-cyber-green pb-6 flex justify-between items-center">
                      <h1 className="text-4xl md:text-5xl font-bold text-cyber-green glitch-effect">ESTADO DE MISIÓN</h1>
                      <div className="animate-pulse">
                          <span className="inline-block w-4 h-4 rounded-full bg-cyber-red mr-2"></span>
                          <span className="text-cyber-red tracking-widest">EN VIVO</span>
                      </div>
                  </header>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                      {/* LEADERBOARD */}
                      <div className="bg-gray-900/50 border border-cyber-green/50 p-6 shadow-[0_0_20px_rgba(0,255,65,0.1)]">
                          <h2 className="text-2xl font-bold text-cyber-gold mb-6 border-b border-cyber-gold/30 pb-2 flex items-center">
                              <span className="mr-3">🏆</span> TABLA DE CLASIFICACIÓN
                          </h2>
                          
                          <div className="space-y-4">
                              {gameState.finishedSquads.length === 0 ? (
                                  <p className="text-gray-500 italic text-center py-8">Esperando datos de finalización...</p>
                              ) : (
                                  gameState.finishedSquads.map((squad, index) => {
                                      const isFirst = index === 0;
                                      return (
                                          <div key={squad.name} className={`flex items-center justify-between p-4 border ${isFirst ? 'border-cyber-gold bg-cyber-gold/10 scale-105' : 'border-cyber-green bg-cyber-green/5'} transition-all`}>
                                              <div className="flex items-center gap-4">
                                                  <span className={`text-2xl font-black ${isFirst ? 'text-cyber-gold' : 'text-cyber-green'}`}>#{index + 1}</span>
                                                  <div className="flex flex-col">
                                                    <span className="text-xl font-bold">{squad.name}</span>
                                                    <span className={`text-sm ${isFirst ? 'text-cyber-gold' : 'text-cyber-green'} opacity-80`}>TIEMPO: {formatTime(squad.time)}</span>
                                                  </div>
                                              </div>
                                              {isFirst && <span className="text-xs text-cyber-gold animate-pulse">OPERACIÓN COMPLETADA</span>}
                                          </div>
                                      );
                                  })
                              )}
                          </div>
                      </div>

                      {/* ACTIVE SQUADS */}
                      <div className="border border-cyber-blue/30 p-6">
                          <h2 className="text-2xl font-bold text-cyber-blue mb-6 border-b border-cyber-blue/30 pb-2 flex items-center">
                              <span className="mr-3">📡</span> EN PROGRESO
                          </h2>
                          
                          <div className="space-y-2">
                              {activeSquads.length === 0 && gameState.finishedSquads.length > 0 ? (
                                  <p className="text-cyber-green text-center py-4">¡TODOS LOS ESCUADRONES HAN TERMINADO!</p>
                              ) : activeSquads.length === 0 ? (
                                  <p className="text-gray-500 italic">Sin escuadrones activos.</p>
                              ) : (
                                  activeSquads.map((squad) => (
                                      <div key={squad} className="flex items-center gap-3 text-gray-400 p-2 border-l-2 border-cyber-blue/50 pl-4">
                                          <span className="w-2 h-2 bg-cyber-blue animate-pulse rounded-full"></span>
                                          <span className="text-lg">{squad}</span>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (gameState.stage === 'squad-lobby') {
      const currentSquad = SQUADS.find(s => s.name === gameState.squadAnimal);
      
      return (
          <div className="min-h-screen flex items-center justify-center font-mono bg-black p-4">
              <div className="w-full max-w-lg border border-cyber-green/30 bg-cyber-green/5 p-8 text-center relative overflow-hidden">
                  {/* Decorative corner */}
                  <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-cyber-green/50"></div>
                  <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-cyber-green/50"></div>
                  
                  <div className="text-6xl mb-6 animate-bounce">
                      {currentSquad?.icon || '⏳'}
                  </div>
                  
                  <h2 className="text-3xl font-bold text-cyber-green mb-2 uppercase">
                      ESCUADRÓN {gameState.squadAnimal}
                  </h2>
                  <div className="inline-block px-4 py-1 border border-cyber-green/50 text-cyber-green text-sm mb-6 bg-black">
                      REGISTRO CONFIRMADO
                  </div>

                  <div className="h-px w-full bg-cyber-green/30 my-6"></div>

                  <h3 className="text-xl text-cyber-blue animate-pulse mb-4">
                      ESPERANDO SEÑAL DE INICIO...
                  </h3>
                  
                  <p className="text-gray-400 font-mono text-sm leading-relaxed">
                      NO CIERRES ESTA VENTANA.<br/>
                      EL ADMINISTRADOR ACTIVARÁ EL PROTOCOLO EN BREVE.
                  </p>
              </div>
          </div>
      );
  }

  if (gameState.stage === 'squad-intro') {
      return (
          <MissionIntro onStart={beginGame} />
      );
  }

  if (gameState.stage === 'squad-game') {
     const activeSector = gameState.sectors.find(s => s.id === activeSectorId);
     // ... (Existing Game Logic View, same as before)
     return (
          <div className="min-h-screen bg-black text-white font-mono p-4 md:p-8 flex flex-col md:flex-row gap-8 relative">
              
              {/* Main Game Area: Sectors */}
              <div className="flex-1">
                  <header className="mb-8 border-b border-cyber-green/30 pb-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-cyber-green glitch-effect">PANEL DE CONTROL</h1>
                        <p className="text-sm text-cyber-blue">ESCUADRÓN: {gameState.squadAnimal}</p>
                    </div>
                    {/* Mission Timer UI */}
                     <div className="flex flex-col items-end">
                        <span className="text-xs text-cyber-blue tracking-widest">TIEMPO MISIÓN</span>
                        <div className="text-3xl md:text-4xl font-black font-mono text-cyber-green border-2 border-cyber-green px-4 py-1 bg-black/50 shadow-[0_0_15px_#00ff41]">
                            {/* Simple inline formatting for the timer on squad side, utilizing the MissionTimer component logic if available, or just calculating it here since we have missionStartTime state */}
                            {missionStartTime ? formatTime(Date.now() - missionStartTime) : "00:00"}
                        </div>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {gameState.sectors.map((sector) => {
                          let statusClass = "border-cyber-blue/50 text-cyber-blue hover:bg-cyber-blue/10";
                          let statusText = "ACTIVO";
                          let statusIcon = "⦿";

                          if (sector.isSolved) {
                              statusClass = "border-cyber-green bg-cyber-green/20 text-cyber-green shadow-[0_0_15px_rgba(0,255,65,0.3)]";
                              statusText = "RESUELTO";
                              statusIcon = "✔";
                          } else if (sector.isLocked) {
                              statusClass = "border-cyber-red bg-cyber-red/10 text-cyber-red opacity-80 cursor-not-allowed";
                              statusText = "BLOQUEADO";
                              statusIcon = "✖";
                          }

                          return (
                              <div 
                                key={sector.id}
                                onClick={() => handleSectorClick(sector.id)}
                                className={`border-2 p-6 min-h-[160px] flex flex-col justify-between transition-all relative overflow-hidden group cursor-pointer ${statusClass}`}
                              >
                                  <div className="flex justify-between items-start">
                                      <h3 className="text-2xl font-bold">{sector.name}</h3>
                                      <span className="text-xl">{statusIcon}</span>
                                  </div>
                                  
                                  <div className="mt-4">
                                      <p className="text-xs tracking-widest">{statusText}</p>
                                      {sector.isLocked && sector.lockoutEndTime && (
                                          <p className="text-xl font-bold animate-pulse mt-2">
                                              {Math.max(0, Math.ceil((sector.lockoutEndTime - Date.now()) / 1000))}s
                                          </p>
                                      )}
                                      {sector.isSolved && (
                                          <div className="mt-2 text-3xl font-black text-white bg-black inline-block px-2 border border-cyber-green">
                                              {sector.accessCode}
                                          </div>
                                      )}
                                  </div>

                                  {/* Decor */}
                                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-current opacity-50"></div>
                              </div>
                          );
                      })}
                  </div>
              </div>

              {/* Sidebar: Master Vault */}
              <div className="w-full md:w-80 border-l border-cyber-green/30 md:pl-8 pt-8 md:pt-0">
                  <div className="border-2 border-cyber-blue p-6 bg-cyber-blue/5 relative">
                      <h2 className="text-xl text-cyber-blue font-bold mb-6 flex items-center gap-2">
                          <span>🔒</span> BÓVEDA MAESTRA
                      </h2>

                      {!finalRevealed ? (
                          <div className="space-y-4">
                              <p className="text-xs text-gray-400 mb-4">INGRESA LOS CÓDIGOS DE ACCESO</p>
                              {gameState.sectors.map((sec, idx) => (
                                  <div key={idx} className="flex items-center justify-between">
                                      <label className="text-xs text-cyber-green w-16">SEC_0{idx+1}</label>
                                      <input 
                                        type="text" 
                                        maxLength={2}
                                        value={vaultInputs[idx]}
                                        onChange={(e) => handleVaultInput(idx, e.target.value)}
                                        className="w-16 bg-black border border-gray-700 text-center text-white py-1 focus:border-cyber-green focus:outline-none"
                                      />
                                  </div>
                              ))}
                              
                              <button 
                                onClick={attemptVaultUnlock}
                                className="w-full mt-6 bg-cyber-blue text-black font-bold py-3 hover:bg-white transition-colors"
                              >
                                  DESBLOQUEAR
                              </button>
                              
                              <p className="text-center text-xs text-cyber-red mt-2 h-4">{vaultMessage === 'BLOQUEADO' ? '' : vaultMessage}</p>
                          </div>
                      ) : (
                          <div className="text-center py-8 animate-pulse">
                              <h3 className="text-cyber-green mb-2">CLAVE FINAL:</h3>
                              <div className="bg-cyber-green text-black text-4xl font-black py-4 px-2 break-all border-4 border-white shadow-[0_0_30px_#00ff41]">
                                  {gameState.adminKeyword}
                              </div>
                              <p className="mt-4 text-white text-sm">¡GRITA LA CLAVE!</p>
                          </div>
                      )}
                  </div>
              </div>
              
              {/* LOCKOUT OVERLAY */}
               {gameState.sectors.find(s => s.isLocked && s.lockoutEndTime && s.lockoutEndTime > Date.now()) && (
                  <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-auto cursor-not-allowed">
                       <div className="text-center animate-pulse">
                          <h2 className="text-cyber-red text-6xl md:text-8xl font-black glitch-effect mb-4">¡SISTEMA BLOQUEADO!</h2>
                          <div className="text-9xl font-mono text-cyber-red border-4 border-cyber-red rounded-full w-64 h-64 flex items-center justify-center mx-auto bg-black shadow-[0_0_50px_#ff003c]">
                              {Math.max(0, Math.ceil((gameState.sectors.find(s => s.isLocked)!.lockoutEndTime! - Date.now()) / 1000))}
                          </div>
                       </div>
                   </div>
              )}

              {/* Modals */}
              {activeSector && (
                  <SectorModal 
                    sector={activeSector}
                    isOpen={!!activeSector}
                    onSectorSolved={handleSectorSolved}
                    onSectorLocked={handleSectorLocked}
                  />
              )}

          </div>
      );
  }

  return null;
}

export default App;