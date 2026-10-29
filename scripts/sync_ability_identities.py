"""Identify signature ability rows in metadata without treating them as shop purchases.

Uses the same pinned client dump and MurmurHash2 convention as sync_snapshot.py.
No network access is required. python scripts/sync_ability_identities.py --source-dir ...
"""
import argparse
import hashlib
import json
import pathlib
from sync_snapshot import COMMIT, item_hash, read_kv, resolved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=pathlib.Path, required=True)
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[1]
    snapshot = json.loads((root / 'src/data/snapshot.json').read_text())
    heroes_file = args.source_dir / 'heroes.vdata'
    digest = hashlib.sha256(heroes_file.read_bytes()).hexdigest()
    if digest != snapshot['hashes']['heroes.vdata']:
        raise ValueError('heroes.vdata does not match the pinned catalogue')
    heroes = read_kv(heroes_file)
    abilities = {}
    for name in heroes:
        if not name.startswith('hero_'):
            continue
        hero = resolved(name, heroes)
        for slot, ability in hero.get('m_mapBoundAbilities', {}).items():
            if slot.startswith('ESlot_Signature_') and ability:
                identifier = str(item_hash(ability))
                if identifier in abilities and abilities[identifier] != ability:
                    raise ValueError('Ability hash collision')
                abilities[identifier] = ability
    if set(abilities) & {str(i['apiId']) for i in snapshot['items']}:
        raise ValueError('Shop item / signature ability collision')
    result = {
        'clientVersion': snapshot['clientVersion'], 'commit': COMMIT,
        'source': f'https://github.com/SteamDatabase/GameTracking-Deadlock/blob/{COMMIT}/game/citadel/pak01_dir/scripts/heroes.vdata',
        'sha256': digest, 'abilities': dict(sorted(abilities.items(), key=lambda p: int(p[0]))),
    }
    (root / 'src/data/abilityIdentities.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'{len(abilities)} signature ability identities extracted')


if __name__ == '__main__':
    main()
