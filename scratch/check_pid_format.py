import json

with open('allorangedashboard/ceo_data/products.json', 'r', encoding='utf-8') as f:
    products = json.load(f).get('products', {})

with open('allorangedashboard/categories_map.json', 'r', encoding='utf-8') as f:
    cat_map = json.load(f)

# Find if any key in cat_map is present as a key in products.json
common_keys = set(cat_map.keys()).intersection(set(products.keys()))
print(f"Number of common keys: {len(common_keys)}")

# Print a few examples of how they overlap or map
sample_cat_keys = list(cat_map.keys())[:10]
print("Sample keys from cat_map:", sample_cat_keys)

# Find products in products.json where alias is in cat_map
alias_matches = []
for pid, pinfo in products.items():
    alias = pinfo.get('alias', '')
    if alias in cat_map:
        alias_matches.append((pid, alias, cat_map[alias]))

print(f"Number of products where alias is in cat_map: {len(alias_matches)}")
if alias_matches:
    print("Sample alias matches (PID, Alias, Category):")
    for item in alias_matches[:10]:
        print(item)
