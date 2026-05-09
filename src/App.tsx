import React, { useEffect, useState, useRef } from 'react';
import Phaser from 'phaser';
import { Volume2, VolumeX, Coins, Play, Trophy, Info } from 'lucide-react';
import { Howl } from 'howler';

// --- SOUNDS ---
const SOUND_URLS = {
  bgm: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0c6ff1101.mp3', // Relaxing/Fun loop
  spin: 'https://assets.mixkit.co/active_storage/sfx/2005/2005-preview.mp3',
  win: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  jackpot: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'
};

const sounds: Record<string, Howl> = {};

const initSounds = () => {
  sounds.bgm = new Howl({ src: [SOUND_URLS.bgm], loop: true, volume: 0.3 });
  sounds.spin = new Howl({ src: [SOUND_URLS.spin], volume: 0.5 });
  sounds.win = new Howl({ src: [SOUND_URLS.win], volume: 0.6 });
  sounds.jackpot = new Howl({ src: [SOUND_URLS.jackpot], volume: 0.8 });
};

// --- CONSTANTS ---
const SYMBOL_TYPES = [
  { name: 'CHERRY', color: 0xff0000, value: 5 },
  { name: 'LEMON', color: 0xffff00, value: 10 },
  { name: 'GRAPE', color: 0x800080, value: 15 },
  { name: 'BELL', color: 0xffa500, value: 25 },
  { name: 'DIAMOND', color: 0x00ffff, value: 50 },
  { name: 'SEVEN', color: 0xff00ff, value: 100 },
];

const REEL_COUNT = 3;
const SYMBOLS_PER_REEL = 3;
const SYMBOL_HEIGHT = 120;
const REEL_WIDTH = 120;
const SPIN_DURATION = 2000;

// --- PHASER SCENE ---
class SlotScene extends Phaser.Scene {
  private reels: Phaser.GameObjects.Container[] = [];
  private isSpinning = false;
  private onSpinComplete?: (results: number[]) => void;

  constructor() {
    super('SlotScene');
  }

  preload() {
    // Generate symbol textures programmatically to ensure they work without external assets
    SYMBOL_TYPES.forEach((symbol, index) => {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(symbol.color, 1);
      graphics.fillRect(10, 10, 100, 100);
      graphics.lineStyle(4, 0xffffff, 1);
      graphics.strokeRect(10, 10, 100, 100);
      
      // Add a simple label to the texture
      const text = this.make.text({
        x: 60,
        y: 60,
        text: symbol.name[0],
        style: { fontSize: '48px', color: '#fff', fontStyle: 'bold' },
        add: false
      }).setOrigin(0.5);
      
      const rt = this.add.renderTexture(0, 0, 120, 120);
      rt.draw(graphics);
      rt.draw(text);
      rt.saveTexture(`symbol_${index}`);
      rt.destroy();
      graphics.destroy();
      text.destroy();
    });
  }

  create() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    // Background Frame
    this.add.rectangle(centerX, centerY, REEL_WIDTH * REEL_COUNT + 40, SYMBOL_HEIGHT * SYMBOLS_PER_REEL + 40, 0x333333)
      .setStrokeStyle(4, 0xffd700);

    // Create Reels
    const startX = centerX - (REEL_WIDTH * (REEL_COUNT - 1)) / 2;
    
    for (let i = 0; i < REEL_COUNT; i++) {
      const reelContainer = this.add.container(startX + i * REEL_WIDTH, centerY);
      
      // Mask for reel
      const maskShape = this.add.graphics();
      maskShape.fillRect(
        startX + i * REEL_WIDTH - REEL_WIDTH / 2, 
        centerY - (SYMBOL_HEIGHT * SYMBOLS_PER_REEL) / 2, 
        REEL_WIDTH, 
        SYMBOL_HEIGHT * SYMBOLS_PER_REEL
      );
      const mask = maskShape.createGeometryMask();
      reelContainer.setMask(mask);

      // Add a bunch of random symbols initially
      for (let j = -2; j < SYMBOLS_PER_REEL + 2; j++) {
        const symbolIdx = Phaser.Math.Between(0, SYMBOL_TYPES.length - 1);
        const sprite = this.add.sprite(0, j * SYMBOL_HEIGHT, `symbol_${symbolIdx}`);
        sprite.setData('index', symbolIdx);
        reelContainer.add(sprite);
      }
      
      this.reels.push(reelContainer);
    }
  }

  public spin(callback: (results: number[]) => void) {
    if (this.isSpinning) return;
    this.isSpinning = true;
    this.onSpinComplete = callback;

    const finalResults: number[] = [];

    this.reels.forEach((reel, i) => {
      const extraSpins = 10 + i * 5; // Staggered stop
      const targetY = SYMBOL_HEIGHT * extraSpins;
      
      this.tweens.add({
        targets: reel,
        y: reel.y + targetY,
        duration: SPIN_DURATION + i * 500,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          // Wrap symbols
          reel.each((child: Phaser.GameObjects.Sprite) => {
            const worldY = reel.y + child.y;
            const topLimit = this.scale.height / 2 - (SYMBOL_HEIGHT * 3);
            const bottomLimit = this.scale.height / 2 + (SYMBOL_HEIGHT * 3);
            
            if (worldY > bottomLimit) {
              child.y -= SYMBOL_HEIGHT * (SYMBOLS_PER_REEL + 4);
              const newIdx = Phaser.Math.Between(0, SYMBOL_TYPES.length - 1);
              child.setTexture(`symbol_${newIdx}`);
              child.setData('index', newIdx);
            }
          });
        },
        onComplete: () => {
          // When reel stops, find the center symbol
          let closestSymbol: Phaser.GameObjects.Sprite | null = null;
          let minDist = Infinity;
          
          reel.each((child: Phaser.GameObjects.Sprite) => {
             const dist = Math.abs(child.y); // Container-relative y=0 is the center
             if (dist < minDist) {
               minDist = dist;
               closestSymbol = child;
             }
          });

          if (closestSymbol) {
             finalResults[i] = (closestSymbol as Phaser.GameObjects.Sprite).getData('index');
          }

          if (i === REEL_COUNT - 1) {
            this.isSpinning = false;
            this.onSpinComplete?.(finalResults);
          }
        }
      });
    });
  }
}

// --- REACT UI COMPONENTS ---
const HUD = ({ 
  balance, 
  bet, 
  setBet, 
  onSpin, 
  spinning, 
  isMuted, 
  toggleMute,
  lastWin
}: any) => {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none select-none">
      {/* Top Bar */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md border-2 border-yellow-500 p-4 rounded-xl flex items-center gap-3">
          <Coins className="text-yellow-400 w-6 h-6" />
          <div>
            <div className="text-xs uppercase text-gray-400 font-bold">Balance</div>
            <div className="text-2xl font-black text-white">${balance.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end">
           <button 
            onClick={toggleMute}
            className="bg-black/60 p-3 rounded-full border-2 border-white/20 hover:border-white transition-all pointer-events-auto"
          >
            {isMuted ? <VolumeX className="text-white" /> : <Volume2 className="text-white" />}
          </button>
        </div>
      </div>

      {/* Center Messages */}
      <div className="flex-1 flex items-center justify-center">
        {lastWin > 0 && (
          <div className="animate-bounce bg-yellow-500 text-black px-8 py-3 rounded-full font-black text-3xl shadow-[0_0_30px_rgba(234,179,8,0.5)]">
            WIN: ${lastWin}!
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="bg-black/80 backdrop-blur-xl border-t-4 border-yellow-600 p-6 flex flex-wrap items-center justify-around gap-6 pointer-events-auto">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-xs text-yellow-500 font-bold uppercase">Bet Amount</div>
            <div className="flex items-center gap-2 mt-1">
              {[10, 50, 100].map((val) => (
                <button
                  key={val}
                  onClick={() => setBet(val)}
                  disabled={spinning}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${
                    bet === val 
                      ? 'bg-yellow-500 text-black scale-110 shadow-lg' 
                      : 'bg-white/10 text-white hover:bg-white/20'
                  } disabled:opacity-50`}
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onSpin}
          disabled={spinning || balance < bet}
          className={`
            group relative flex items-center gap-3 px-12 py-5 rounded-2xl font-black text-2xl uppercase transition-all
            ${spinning 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:scale-105 active:scale-95 shadow-[0_10px_0_rgb(153,27,27)]'
            }
          `}
        >
          {spinning ? 'Spinning...' : (
            <>
              <Play className="fill-white" />
              Spin
            </>
          )}
        </button>

        <div className="hidden md:block text-right">
           <div className="flex items-center gap-2 text-yellow-500 font-bold justify-end">
             <Trophy size={18} />
             <span>JACKPOT: $10,000</span>
           </div>
           <div className="text-xs text-gray-500">3x SEVENS to Win!</div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<SlotScene | null>(null);
  
  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('slot_balance');
    return saved ? parseInt(saved) : 1000;
  });
  
  const [bet, setBet] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('slot_muted');
    return saved === 'true';
  });

  useEffect(() => {
    initSounds();
    if (!isMuted) sounds.bgm.play();

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: 'phaser-container',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#1a1a1a',
      scene: [SlotScene],
      physics: { default: 'arcade' },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      }
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.events.on('ready', () => {
      sceneRef.current = game.scene.getScene('SlotScene') as SlotScene;
    });

    return () => {
      game.destroy(true);
      sounds.bgm.stop();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('slot_balance', balance.toString());
  }, [balance]);

  useEffect(() => {
    localStorage.setItem('slot_muted', isMuted.toString());
    if (isMuted) {
      sounds.bgm.mute(true);
      sounds.spin.mute(true);
      sounds.win.mute(true);
      sounds.jackpot.mute(true);
    } else {
      sounds.bgm.mute(false);
      sounds.spin.mute(false);
      sounds.win.mute(false);
      sounds.jackpot.mute(false);
      if (!sounds.bgm.playing()) sounds.bgm.play();
    }
  }, [isMuted]);

  const handleSpin = () => {
    if (!sceneRef.current || spinning || balance < bet) return;

    setSpinning(true);
    setLastWin(0);
    setBalance(prev => prev - bet);
    sounds.spin.play();

    sceneRef.current.spin((results) => {
      setSpinning(false);
      calculateWin(results);
    });
  };

  const calculateWin = (results: number[]) => {
    // Check for 3 of a kind
    const unique = new Set(results);
    if (unique.size === 1) {
      const symbolIdx = results[0];
      const symbol = SYMBOL_TYPES[symbolIdx];
      const multiplier = symbol.value;
      const winAmount = bet * multiplier;
      
      if (symbol.name === 'SEVEN') {
        sounds.jackpot.play();
        setBalance(prev => prev + 10000);
        setLastWin(10000);
      } else {
        sounds.win.play();
        setBalance(prev => prev + winAmount);
        setLastWin(winAmount);
      }
    } else if (results[0] === results[1] || results[1] === results[2]) {
      // 2 of a kind (small win)
      const winAmount = Math.floor(bet * 1.5);
      sounds.win.play();
      setBalance(prev => prev + winAmount);
      setLastWin(winAmount);
    }
  };

  const toggleMute = () => setIsMuted(!isMuted);

  return (
    <div className="relative w-screen h-screen bg-[#111] overflow-hidden font-sans text-white">
      {/* Game Canvas */}
      <div id="phaser-container" className="w-full h-full" />

      {/* UI Overlay */}
      <HUD 
        balance={balance} 
        bet={bet} 
        setBet={setBet} 
        onSpin={handleSpin} 
        spinning={spinning} 
        isMuted={isMuted}
        toggleMute={toggleMute}
        lastWin={lastWin}
      />

      {/* Info Overlay */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-2 bg-black/40 backdrop-blur p-2 px-4 rounded-full border border-white/10">
        <Info size={14} className="text-yellow-500" />
        <span className="text-xs font-medium text-gray-300">Match 3 symbols to win huge multipliers!</span>
      </div>
    </div>
  );
}