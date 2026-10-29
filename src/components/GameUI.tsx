import { useEffect, useRef, type ReactNode } from 'react'
import { Check, Crosshair, Flame, Heart, Layers3, Shield, X, Zap } from 'lucide-react'
import type { HeroIdentity, Item } from '../domain/types'
import artwork from '../../public/assets/provenance.json'

const images = new Set(artwork.files.map((f) => '/' + f.path.replace(/^public\//, '')))
export const roman = ['', 'I', 'II', 'III', 'IV']
export const number = (n: number) => Math.round(n).toLocaleString('fr-FR')
export const clock = (seconds: number | null) =>
  seconds === null
    ? '—'
    : `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`
export const shortNumber = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k` : number(n)

export function ItemArt({ item, className = '' }: { item: Item; className?: string }) {
  const path = `/assets/items/${item.id}.png`
  const Icon =
    item.category === 'spirit'
      ? Flame
      : item.category === 'vitality'
        ? item.active
          ? Shield
          : Heart
        : item.id.includes('clip')
          ? Layers3
          : Crosshair
  return (
    <span className={`item-art ${item.category} ${item.active ? 'active-item' : ''} ${className}`}>
      {images.has(path) ? (
        <img src={path} alt="" loading="lazy" />
      ) : (
        <Icon size={34} strokeWidth={1.5} />
      )}
      <span className="item-tier" aria-hidden="true">
        {roman[item.tier]}
      </span>
    </span>
  )
}

export function HeroPortrait({
  hero,
  size = '',
  name,
}: {
  hero?: HeroIdentity
  size?: string
  name?: string
}) {
  const path = hero?.portrait ?? (hero ? `/assets/heroes/${hero.name.toLowerCase()}.png` : '')
  return (
    <span className={`hero-portrait ${size}`} aria-hidden="true">
      {images.has(path) || /^\/assets\/heroes\/\d+\.png$/.test(path) ? (
        <img src={path} alt="" />
      ) : (
        <span>{name?.slice(0, 2) ?? '?'}</span>
      )}
    </span>
  )
}

export function ItemTile({
  item,
  onClick,
  label,
  included = false,
  actions,
  selected = false,
  onInspect,
}: {
  item: Item
  onClick?: () => void
  label: string
  included?: boolean
  actions?: ReactNode
  selected?: boolean
  onInspect?: () => void
}) {
  return (
    <article
      className={`game-item ${item.category} ${selected ? 'selected' : ''} ${included ? 'included' : ''}`}
    >
      <button
        className="item-face"
        onClick={onClick}
        disabled={included && !actions}
        aria-label={label}
        title={`${item.name} · ${number(item.cost)} âmes`}
      >
        <ItemArt item={item} />
        <span className="game-item-name">{item.name}</span>
        {included && !actions && (
          <span className="owned-mark">
            <Check size={14} />
          </span>
        )}
      </button>
      {actions && <div className="tile-actions">{actions}</div>}
      {onInspect && (
        <button
          className="inspect-item"
          aria-label={`Examiner ${item.name}`}
          title="Détails"
          onClick={onInspect}
        >
          i
        </button>
      )}
    </article>
  )
}

export function Modal({
  children,
  title,
  onClose,
  className = '',
}: {
  children: ReactNode
  title: string
  onClose: () => void
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`game-modal ${className}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}

export const metricIcons = { sustained: Crosshair, burst: Zap, health: Heart, spirit: Flame }
export function ScopeBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="scope-badge"
      tabIndex={0}
      title="Arme au niveau de base. Compétences, passifs du héros et bonus d’investissement non calculés. Modèle non calibré en jeu."
      aria-label="Modèle partiel : arme au niveau de base, compétences et bonus d’investissement exclus"
    >
      <Flame size={12} />
      {!compact && 'Partiel'}
    </span>
  )
}
