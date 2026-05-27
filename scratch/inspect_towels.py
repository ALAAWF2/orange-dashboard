import json

# Load categories map
with open('allorangedashboard/categories_map.json', 'r', encoding='utf-8') as f:
    cat_map = json.load(f)

# Load products.json
with open('allorangedashboard/ceo_data/products.json', 'r', encoding='utf-8') as f:
    prod_data = json.load(f)

products = prod_data.get('products', {})

print("Inspecting a few items starting with '7142', '7148', '7141', '7123':")
prefixes = ['7142', '7148', '7141', '7123', '7155']
found = 0
for pid, pinfo in products.items():
    for pref in prefixes:
        if pid.startswith(pref):
            cat = cat_map.get(pid, cat_map.get(pinfo.get('alias', ''), 'Not Classified'))
            print(f"ID: {pid} | Alias: {pinfo.get('alias')} | Name: {pinfo.get('name')} | Price: {pinfo.get('price')} | Mapped Cat: {cat}")
            found += 1
            if found > 30:
                break
    if found > 30:
        break
