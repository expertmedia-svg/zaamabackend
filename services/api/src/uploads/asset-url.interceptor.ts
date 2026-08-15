import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { UploadsService } from './uploads.service';

/// Champs de réponse traités comme des références vers un objet de
/// stockage à résoudre en lien signé plutôt que renvoyés tels quels.
const ASSET_FIELDS = new Set(['avatarUrl', 'coverUrl', 'logoUrl']);

/// Comme [ASSET_FIELDS], mais pour les champs qui contiennent une liste de
/// clés d'objet plutôt qu'une seule (ex. les photos d'un produit).
const ASSET_LIST_FIELDS = new Set(['images']);

/// Résout automatiquement, sur **toute** réponse de l'API, les champs
/// avatar/couverture/logo stockés comme clé d'objet interne vers un lien
/// signé effectivement utilisable par le client — sans que chaque
/// contrôleur/service ait à s'en charger lui-même.
///
/// Centraliser ça ici évite d'avoir à modifier (et à tenir synchronisés)
/// les nombreux endroits du serveur qui renvoient un profil, un groupe, une
/// entreprise ou un membre de conversation.
@Injectable()
export class AssetUrlInterceptor implements NestInterceptor {
  constructor(private readonly uploads: UploadsService) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(mergeMap((body) => from(this.resolve(body))));
  }

  private async resolve(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.resolve(item)));
    }
    if (value instanceof Date || value === null || typeof value !== 'object') {
      return value;
    }
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(
        async ([key, val]): Promise<[string, unknown]> => {
          if (ASSET_FIELDS.has(key) && typeof val === 'string' && val) {
            return [key, await this.uploads.resolveAssetUrl(val)];
          }
          if (ASSET_LIST_FIELDS.has(key) && Array.isArray(val)) {
            return [
              key,
              await Promise.all(
                val.map((item) =>
                  typeof item === 'string'
                    ? this.uploads.resolveAssetUrl(item)
                    : item,
                ),
              ),
            ];
          }
          return [key, await this.resolve(val)];
        },
      ),
    );
    return Object.fromEntries(entries);
  }
}
