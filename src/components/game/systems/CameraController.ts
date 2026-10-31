import * as Phaser from "phaser";
import {
  CAMERA_LERP,
  ZOOM_SENSITIVITY,
  ZOOM_DEFAULT,
  ZOOM_MIN,
  ZOOM_MAX,
  CAMERA_DRAG_THRESHOLD,
} from "@/lib/constants";

export class CameraController {
  private scene: Phaser.Scene;
  private playerSprite: Phaser.Physics.Arcade.Sprite;

  cameraDragging = false;
  cameraFollowing = true;
  mapWidth = 0;
  mapHeight = 0;

  constructor(
    scene: Phaser.Scene,
    playerSprite: Phaser.Physics.Arcade.Sprite,
    mapWidth: number,
    mapHeight: number,
  ) {
    this.scene = scene;
    this.playerSprite = playerSprite;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
  }

  getFitZoom(cam: Phaser.Cameras.Scene2D.Camera): number {
    if (this.mapWidth <= 0 || this.mapHeight <= 0 || cam.width <= 0 || cam.height <= 0) {
      return 0.65;
    }
    const isFullscreen = cam.width >= 1000 && cam.height >= 650;
    const zX = cam.width / this.mapWidth;
    const zY = cam.height / this.mapHeight;
    const baseFit = Math.min(zX, zY);

    // On fullscreen mode, zoom in (1.35x - 1.5x) so the office map opens large, crisp and zoomed in
    if (isFullscreen) {
      return Math.max(1.35, baseFit * 1.3);
    }
    return baseFit;
  }

  init() {
    const cam = this.scene.cameras.main;
    cam.setBackgroundColor("#1a1814");
    cam.setRoundPixels(true);
    
    // Auto-fit entire map on initial load
    const fitZoom = this.getFitZoom(cam);
    cam.setZoom(fitZoom);
    this.updateCameraBounds();
    cam.centerOn(this.mapWidth / 2, this.mapHeight / 2);
    this.cameraFollowing = false;

    this.scene.scale.on("resize", () => {
      this.updateCameraBounds();
      const newFit = this.getFitZoom(cam);
      cam.setZoom(newFit);
      if (!this.cameraFollowing) {
        cam.centerOn(this.mapWidth / 2, this.mapHeight / 2);
      }
    });
    this.initWheel(cam);
    this.initCameraDrag(cam);
  }

  private initWheel(cam: Phaser.Cameras.Scene2D.Camera) {
    const canvas = this.scene?.game?.canvas;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      if (!cam || !cam.scaleManager?.displayScale || !this.scene?.game) {
        canvas.removeEventListener("wheel", onWheel);
        return;
      }
      e.preventDefault();
      const delta = e.ctrlKey ? e.deltaY * 3 : e.deltaY;
      const oldZoom = cam.zoom;
      const minZoom = Math.min(this.getFitZoom(cam), 0.55);
      const newZoom = Phaser.Math.Clamp(oldZoom - delta * ZOOM_SENSITIVITY, minZoom, 2.8);
      if (Math.abs(newZoom - oldZoom) < 0.001) return;

      const scale = cam.scaleManager.displayScale;
      if (!scale.x || !scale.y) return;

      const sx = e.offsetX / scale.x;
      const sy = e.offsetY / scale.y;
      const worldBefore = cam.getWorldPoint(sx, sy);
      cam.setZoom(newZoom);
      this.updateCameraBounds();

      const worldAfter = cam.getWorldPoint(sx, sy);
      cam.scrollX += worldBefore.x - worldAfter.x;
      cam.scrollY += worldBefore.y - worldAfter.y;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    this.scene.events?.once("shutdown", () => canvas.removeEventListener("wheel", onWheel));
    this.scene.events?.once("destroy", () => canvas.removeEventListener("wheel", onWheel));
  }

  initCameraDrag(cam: Phaser.Cameras.Scene2D.Camera) {
    let lastX = 0;
    let lastY = 0;

    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.cameraDragging = true;
        lastX = pointer.x;
        lastY = pointer.y;
      }
    });

    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.cameraDragging || !pointer.leftButtonDown()) return;

      const dx = lastX - pointer.x;
      const dy = lastY - pointer.y;
      lastX = pointer.x;
      lastY = pointer.y;

      if (Math.abs(dx) > CAMERA_DRAG_THRESHOLD || Math.abs(dy) > CAMERA_DRAG_THRESHOLD) {
        if (this.cameraFollowing) {
          cam.stopFollow();
          this.cameraFollowing = false;
        }
        cam.scrollX += dx / cam.zoom;
        cam.scrollY += dy / cam.zoom;
      }
    });

    this.scene.input.on("pointerup", () => {
      this.cameraDragging = false;
    });
  }

  resumeCameraFollow() {
    if (!this.cameraFollowing) {
      this.scene.cameras.main.startFollow(this.playerSprite, true, CAMERA_LERP, CAMERA_LERP);
      this.cameraFollowing = true;
    }
  }

  /** Recalculate camera bounds so the map is centered when viewport > map at current zoom. */
  updateCameraBounds() {
    const cam = this.scene.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const mw = this.mapWidth;
    const mh = this.mapHeight;

    const bx = viewW > mw ? -(viewW - mw) / 2 : 0;
    const by = viewH > mh ? -(viewH - mh) / 2 : 0;
    const bw = viewW > mw ? viewW : mw;
    const bh = viewH > mh ? viewH : mh;

    cam.setBounds(bx, by, bw, bh);
  }
}
