from typing import List, Dict

# Tiles are derived from repo directories; each tile can be "owned" by a teammate

def derive_tiles(tree_paths: List[str]) -> List[Dict]:
    # Take top-level dirs + a couple of special tiles
    tops = sorted({p.split('/')[0] for p in tree_paths if '/' in p})[:12]
    specials = ["GO", "Community Chest", "Chance", "Jail (CI Fail)"]
    tiles = [{"name": t, "type":"property"} for t in tops]
    return [{"name": specials[0], "type":"go"}] + tiles[:10] + [{"name": specials[1], "type":"chest"}, {"name": specials[2], "type":"chance"}, {"name": specials[3], "type":"jail"}]

def suggest_rebalancing(contribs: Dict[str, Dict]) -> List[str]:
    # If one stat dominates for a user, suggest complementary tasks to others
    suggestions = []
    # Compute team totals per area
    areas = ["writing","coding","reviewing","planning","testing"]
    totals = {a: sum(c.get(a,0) for c in contribs.values()) for a in areas}
    if not any(totals.values()):
        return ["No data yet. Make a PR or add mock data."]

    # Find least-covered area; propose tasks
    least_area = min(areas, key=lambda a: totals[a])
    # Find who is currently lowest in that area
    candidate = min(contribs.keys(), key=lambda u: contribs[u].get(least_area,0))
    suggestions.append(f"Team is light on {least_area}. Suggest assigning next {least_area} task to @{candidate} to balance load.")

    # If someone has many mega PRs, suggest splitting
    heavy = [u for u,v in contribs.items() if v.get("mega_prs",0) >= 1]
    for u in heavy:
        suggestions.append(f"@{u} has a mega PR. Suggest splitting into smaller PRs and distributing reviews to others.")

    return suggestions
