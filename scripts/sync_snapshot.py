"""Extract a small, auditable catalogue from a pinned SteamDatabase client dump.

Usage: python scripts/sync_snapshot.py --source-dir /path/to/research/mechanics
The input is KV3 text, never executable code. Output is committed; no download is
required to install or run the application.
"""
import argparse
import hashlib
import json
import pathlib
import re

COMMIT = 'd251cf9d9a796061c90f58724230b7e17b97121b'
TOKEN = re.compile(r'"(?:\\.|[^"\\])*"|[{}\[\]=,:]|[^\s{}\[\]=,:]+')


def parse(text):
    tokens = TOKEN.findall(text)
    pos = 0

    def value():
        nonlocal pos
        t = tokens[pos]
        pos += 1
        if t == '{':
            out = {}
            while tokens[pos] != '}':
                key = tokens[pos].strip('"')
                pos += 1
                if tokens[pos] != '=':
                    raise ValueError(f'Expected = after {key}: {tokens[pos:pos+4]}')
                pos += 1
                out[key] = value()
                if tokens[pos] == ',':
                    pos += 1
            pos += 1
            return out
        if t == '[':
            out = []
            while tokens[pos] != ']':
                if tokens[pos] == ',':
                    pos += 1
                else:
                    out.append(value())
            pos += 1
            return out
        if pos < len(tokens) and tokens[pos] == ':':
            pos += 1
            return value()
        if t.startswith('"'):
            return json.loads(t)
        if t in ('true', 'false'):
            return t == 'true'
        try:
            return float(t) if any(c in t for c in '.eE') else int(t)
        except ValueError:
            return t
    return value()


def read_kv(path):
    text = path.read_text()
    # Remove comments with a lexer that preserves quoted URLs and escapes.
    clean = re.sub(r'"(?:\\.|[^"\\])*"|<!--.*?-->|//[^\n]*|/\*.*?\*/',
                   lambda m: m[0] if m[0].startswith('"') else '', text, flags=re.S)
    return parse(clean)


def merge(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def resolved(name, data, chain=()):
    if name in chain:
        raise ValueError('Cyclic inheritance: ' + name)
    raw = data.get(name, {})
    out = {}
    parents = raw.get('_multibase', [])
    if isinstance(raw.get('_base'), str):
        parents = [raw['_base'], *parents]
    for parent in parents:
        out = merge(out, resolved(parent, data, (*chain, name)))
    return merge(out, raw)


def item_hash(name):
    # Same MurmurHash2/seed as deadlock_assets_api/models/v2/api_item_base.py.
    data = name.encode()
    h = 0x31415926 ^ len(data)
    offset = 0
    while len(data) - offset >= 4:
        k = int.from_bytes(data[offset:offset+4], 'little')
        k = (k * 0x5bd1e995) & 0xffffffff
        k ^= k >> 24
        k = (k * 0x5bd1e995) & 0xffffffff
        h = ((h * 0x5bd1e995) ^ k) & 0xffffffff
        offset += 4
    tail = data[offset:]
    if tail:
        h ^= int.from_bytes(tail, 'little')
        h = (h * 0x5bd1e995) & 0xffffffff
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xffffffff
    h ^= h >> 15
    return h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source-dir', type=pathlib.Path, required=True)
    args = ap.parse_args()
    abilities = read_kv(args.source_dir / 'abilities.vdata')
    heroes = read_kv(args.source_dir / 'heroes.vdata')
    names = {
        'upgrade_clip_size': 'Basic Magazine', 'upgrade_high_velocity_mag': 'High-Velocity Rounds',
        'upgrade_small_attack_speed': 'Rapid Rounds', 'upgrade_attack_speed_1': 'Swift Striker',
        'upgrade_health': 'Extra Health', 'upgrade_health_2': 'Vitality Spring',
        'upgrade_bullet_armor': 'Bullet Armor', 'upgrade_tech_armor': 'Spirit Armor',
        'upgrade_healbane': 'Healbane', 'upgrade_bullet_resist_shredder': 'Bullet Resist Shredder',
        'upgrade_toxic_bullets': 'Toxic Bullets', 'upgrade_sprint_booster': 'Sprint Boots',
        'upgrade_tech_power': 'Extra Spirit', 'upgrade_tech_power_2': 'Improved Spirit',
        'upgrade_clip_size_2': 'Intensifying Magazine', 'upgrade_attack_speed_2': 'Burst Fire',
        'upgrade_metal_skin': 'Metal Skin', 'upgrade_debuff_reducer': 'Debuff Reducer',
        'upgrade_health_regen_1': 'Extra Regen', 'upgrade_headshot_booster': 'Headshot Booster',
        'upgrade_close_range': 'Close Quarters', 'upgrade_long_range': 'Long Range',
        'upgrade_rapid_rounds': 'Rapid Rounds', 'upgrade_reduce_debuff_duration': 'Debuff Remover',
    }
    items = []
    for key in abilities:
        if not key.startswith('upgrade_'):
            continue
        item = resolved(key, abilities)
        if item.get('m_bDisabled') is True or 'm_iItemTier' not in item:
            continue
        image = item.get('m_strShopIconLarge', '').split('/')[-1].replace('.psd', '')
        if not image:
            continue
        name = names.get(key, image.replace('_', ' ').title())
        tier = int(str(item.get('m_iItemTier', 'EModTier_1')).split('_')[-1])
        if tier not in range(1, 5):
            continue
        props = {}
        for k, v in item.get('m_mapAbilityProperties', {}).items():
            try:
                n = float(v.get('m_strValue', 0))
                if n != 0:
                    props[k] = n
            except (ValueError, TypeError):
                pass
        cat = {'EItemSlotType_WeaponMod': 'weapon', 'EItemSlotType_Armor': 'vitality', 'EItemSlotType_Tech': 'spirit'}.get(item.get('m_eItemSlotType'), 'spirit')
        items.append(dict(id=key, apiId=item_hash(key), name=name, category=cat, tier=tier, cost=[0,800,1600,3200,6400][tier], properties=props,
                          components=item.get('m_vecComponentItems', []), active=item.get('m_eAbilityActivation') != 'CITADEL_ABILITY_ACTIVATION_PASSIVE'))
    output_heroes = []
    for key, name in [('hero_inferno','Infernus'),('hero_haze','Haze'),('hero_gigawatt','Seven'),('hero_wraith','Wraith')]:
        hero = resolved(key, heroes)
        weapon_name = hero['m_mapBoundAbilities']['ESlot_Weapon_Primary']
        weapon = resolved(weapon_name, abilities)['m_mapWeaponInfos']['primary']
        output_heroes.append(dict(id=hero['m_HeroID'], name=name, className=key,
            health=hero['m_mapStartingStats']['EMaxHealth'], moveSpeed=hero['m_mapStartingStats']['EMaxMoveSpeed'],
            weapon={k:weapon[k] for k in ['m_flBulletDamage','m_flCycleTime','m_iClipSize','m_reloadDuration','m_iBullets']},
            investment=hero.get('m_MapModCostBonuses', {})))
    out = dict(clientVersion=6821, date='2026-10-26', commit=COMMIT,
        source=f'https://github.com/SteamDatabase/GameTracking-Deadlock/tree/{COMMIT}',
        hashes={p:hashlib.sha256((args.source_dir/p).read_bytes()).hexdigest() for p in ['abilities.vdata','heroes.vdata']},
        heroes=output_heroes, items=items)
    target = pathlib.Path(__file__).resolve().parents[1] / 'src/data/snapshot.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, indent=2, ensure_ascii=False)+'\n')
    print(f'Extracted {len(items)} items, {len(output_heroes)} heroes → {target}')


if __name__ == '__main__':
    main()
