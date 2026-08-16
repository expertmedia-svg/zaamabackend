import { Injectable } from '@nestjs/common';

/// Suivi en mémoire de qui est actuellement connecté au serveur temps réel.
/// Un utilisateur peut avoir plusieurs appareils connectés en même temps
/// (téléphone + tablette...) : il ne repasse "hors ligne" que quand le
/// dernier socket actif se ferme. Volontairement non persisté — au
/// redémarrage du serveur, tout le monde réapparaît "hors ligne" jusqu'à
/// la prochaine reconnexion, ce qui est correct (les sockets sont de toute
/// façon coupés au redémarrage).
@Injectable()
export class PresenceService {
  private readonly socketsByUser = new Map<string, Set<string>>();

  /** @returns true si cet utilisateur vient de passer en ligne (aucun autre appareil connecté avant). */
  connect(userId: string, socketId: string): boolean {
    const existing = this.socketsByUser.get(userId);
    if (existing) {
      const wasOffline = existing.size === 0;
      existing.add(socketId);
      return wasOffline;
    }
    this.socketsByUser.set(userId, new Set([socketId]));
    return true;
  }

  /** @returns true si cet utilisateur vient de passer hors ligne (plus aucun appareil connecté). */
  disconnect(userId: string, socketId: string): boolean {
    const existing = this.socketsByUser.get(userId);
    if (!existing) return false;
    existing.delete(socketId);
    if (existing.size === 0) {
      this.socketsByUser.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }
}
