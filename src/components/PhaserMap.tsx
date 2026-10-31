'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

// ── Assets ──────────────────────────────────────────────────────────────────
const MAP_URL = '/placeholder-map.png';
const LEX_SPR = '/characters/Premade_Character_48x48_01.png';
const SUSI_SPR = '/characters/Premade_Character_48x48_02.png';
const SPY_SPR = '/characters/Premade_Character_48x48_03.png';
const YORU_SPR = '/characters/Premade_Character_48x48_04.png';

interface PhaserMapProps {
  onSelectAgent?: (agentName: string) => void;
}

export default function PhaserMap({ onSelectAgent }: PhaserMapProps) {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !gameRef.current) return;

    // React strictmode clean-up
    if (gameInstanceRef.current) {
      gameInstanceRef.current.destroy(true);
      gameInstanceRef.current = null;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: gameRef.current,
      backgroundColor: '#1c1c24',
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: {
        noAudio: true,
      },
      scene: {
        preload: function (this: Phaser.Scene) {
          // 1. Preload HQ Map
          this.load.image('hq_map', MAP_URL);

          // Characters sheets (16x16 scaled in create)
          this.load.spritesheet('lex_sheet', LEX_SPR, { frameWidth: 16, frameHeight: 16 });
          this.load.spritesheet('susi_sheet', SUSI_SPR, { frameWidth: 16, frameHeight: 16 });
          this.load.spritesheet('spy_sheet', SPY_SPR, { frameWidth: 16, frameHeight: 16 });
          this.load.spritesheet('yoru_sheet', YORU_SPR, { frameWidth: 16, frameHeight: 16 });
        },
        create: function (this: Phaser.Scene) {
          const width = this.cameras.main.width;
          const height = this.cameras.main.height;

          // Render hq_map centered
          const map = this.add.image(width / 2, height / 2, 'hq_map');
          map.setDisplaySize(width, height);

          // 2. Invisible Walls Physics Group (Static Group)
          const invisibleWalls = this.physics.add.staticGroup();

          // Top-Left "Research Lab" walls
          const labRightWall = this.add.zone(350, 130, 20, 260);
          const labBottomWall = this.add.zone(175, 260, 350, 20);

          // Top-Right "Data Center" walls
          const dataLeftWall = this.add.zone(450, 130, 20, 260);
          const dataBottomWall = this.add.zone(625, 260, 350, 20);

          // Bottom-Left "Strategy Room" walls
          const strategyRightWall = this.add.zone(350, 470, 20, 260);
          const strategyTopWall = this.add.zone(175, 340, 350, 20);

          // Bottom-Right "Creative Studio" walls
          const creativeLeftWall = this.add.zone(450, 470, 20, 260);
          const creativeTopWall = this.add.zone(625, 340, 350, 20);

          // Add zones to the static group
          const wallZones = [
            labRightWall, labBottomWall,
            dataLeftWall, dataBottomWall,
            strategyRightWall, strategyTopWall,
            creativeLeftWall, creativeTopWall
          ];

          wallZones.forEach(zone => {
            this.physics.add.existing(zone, true);
            invisibleWalls.add(zone);
          });

          // Create animations
          const keys = ['lex', 'susi', 'spy', 'yoru'];
          keys.forEach((key) => {
            if (!this.anims.exists(`${key}_idle`)) {
              this.anims.create({
                key: `${key}_idle`,
                frames: this.anims.generateFrameNumbers(`${key}_sheet`, { start: 0, end: 3 }),
                frameRate: 6,
                repeat: -1,
              });
            }
          });

          // Agents config & room coordinates
          const agentsData = [
            { name: 'LEX', sheetKey: 'lex_sheet', color: 0x8b5cf6, startX: 150, startY: 150 },
            { name: 'SUSI', sheetKey: 'susi_sheet', color: 0x3b82f6, startX: 650, startY: 150 },
            { name: 'SPY', sheetKey: 'spy_sheet', color: 0xf59e0b, startX: 150, startY: 450 },
            { name: 'YORU', sheetKey: 'yoru_sheet', color: 0x10b981, startX: 650, startY: 450 },
          ];

          const physicsContainers: Phaser.GameObjects.Container[] = [];

          agentsData.forEach((agent) => {
            // Container with Physics enabled
            const container = this.add.container(agent.startX, agent.startY);
            this.physics.add.existing(container);

            const body = container.body as Phaser.Physics.Arcade.Body;
            body.setCollideWorldBounds(true);
            body.setBounce(1, 1); // bounce off walls organically
            body.setGravity(0, 0);

            // Ground Shadow
            const shadow = this.add.ellipse(0, 16, 20, 5, 0x000000, 0.45);

            // Sprite (2x scale)
            const sprite = this.add.sprite(0, 0, agent.sheetKey);
            sprite.setScale(2);
            sprite.play(`${agent.name.toLowerCase()}_idle`);

            // Nameplate frame
            const bg = this.add.rectangle(0, -20, 36, 12, 0x1c1c24, 0.85);
            bg.setStrokeStyle(1, agent.color);

            // Text
            const text = this.add.text(0, -20, agent.name, {
              font: 'bold 8px monospace',
              color: '#ffffff',
            });
            text.setOrigin(0.5);

            container.add([shadow, sprite, bg, text]);

            // Interactive hit bounds
            container.setSize(32, 48);
            container.setInteractive({ useHandCursor: true });

            container.on('pointerdown', () => {
              onSelectAgent?.(agent.name);
            });

            container.on('pointerover', () => {
              this.tweens.add({ targets: container, scale: 1.15, duration: 120 });
            });

            container.on('pointerout', () => {
              this.tweens.add({ targets: container, scale: 1.0, duration: 120 });
            });

            physicsContainers.push(container);

            // Periodically give random wandering velocity
            const startWandering = () => {
              const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
              const speed = Phaser.Math.Between(35, 60);
              body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            };

            startWandering();

            this.time.addEvent({
              delay: Phaser.Math.Between(2500, 4000),
              callback: startWandering,
              loop: true
            });

            // Flip sprite depending on velocity direction
            this.time.addEvent({
              delay: 100,
              callback: () => {
                if (body.velocity.x < -1) {
                  sprite.setFlipX(true);
                } else if (body.velocity.x > 1) {
                  sprite.setFlipX(false);
                }
              },
              loop: true
            });
          });

          // THE MAGIC COLLIDER Setup
          this.physics.add.collider(physicsContainers, invisibleWalls);

          // Status banner
          this.add.text(12, 12, '● PHASER 2D ENGINE // LIVE', {
            font: 'bold 10px monospace',
            color: '#10B981',
            backgroundColor: '#1c1c24cc',
            padding: { x: 6, y: 3 },
          });
        },
      },
    };

    const game = new Phaser.Game(config);
    gameInstanceRef.current = game;

    return () => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.destroy(true);
        gameInstanceRef.current = null;
      }
    };
  }, [onSelectAgent]);

  return (
    <div
      ref={gameRef}
      className="w-full h-full min-h-[460px] rounded-xl overflow-hidden flex items-center justify-center bg-stone-900 shadow-inner"
    />
  );
}
