import { Mesh } from 'pixi.js';
import { NodeBase } from '../../../layouts/nodes/NodeBase';
import type { RigbyView } from './internal/types';

/** A leaf Pixi node. Its meshes are node-owned; atlas textures stay SDK-owned. */
export class RigbySkeleton extends NodeBase {
  private currentAnimation: string | undefined;
  private elapsed = 0;

  constructor(private readonly skeletonView: RigbyView, animation?: string, private looping = true) {
    super(skeletonView);
    this.currentAnimation = animation;
  }

  get animation(): string | undefined { return this.currentAnimation; }
  get animationTime(): number { return this.elapsed; }
  get timeScale(): number { return this.skeletonView.timeScale; }
  get meshCount(): number { return this.skeletonView.meshCount; }

  play(animation: string, loop = true): void {
    if (this.destroyed) throw new Error('Cannot play a destroyed RigbySkeleton: ' + this.id);
    if (!this.skeletonView.animationNames.includes(animation)) throw new Error(`Unknown Rigby animation '${animation}' on '${this.id}'`);
    this.skeletonView.play(animation, loop);
    this.skeletonView.update(0);
    this.currentAnimation = animation;
    this.looping = loop;
    this.elapsed = 0;
  }

  restart(): void {
    if (this.currentAnimation === undefined) throw new Error('RigbySkeleton has no animation to restart: ' + this.id);
    this.play(this.currentAnimation, this.looping);
  }

  setTimeScale(value: number): void {
    if (this.destroyed) throw new Error('Cannot change a destroyed RigbySkeleton: ' + this.id);
    if (!Number.isFinite(value) || value < 0) throw new Error('RigbySkeleton timeScale must be finite and non-negative');
    this.skeletonView.timeScale = value;
  }

  protected override destroyView(): void {
    const geometries = new Set<InstanceType<typeof Mesh>['geometry']>();
    const collect = (view: import('pixi.js').Container): void => {
      if (view instanceof Mesh) geometries.add(view.geometry);
      for (const child of view.children) collect(child);
    };
    collect(this.view);
    const errors: unknown[] = [];
    try { super.destroyView(); } catch (error) { errors.push(error); }
    for (const geometry of geometries) {
      try { geometry.destroy(true); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'RigbySkeleton disposal failed: ' + this.id);
  }

  override update(dt: number): void {
    if (this.destroyed) return;
    if (!Number.isFinite(dt) || dt < 0) throw new Error('RigbySkeleton dt must be finite and non-negative');
    super.update(dt);
    if (!this.destroyed && this.timeScale > 0) {
      this.skeletonView.update(dt);
      if (this.currentAnimation !== undefined) this.elapsed += dt * this.timeScale;
    }
  }
}
