import json

with open("allorangedashboard/management_data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

output_lines = []
output_lines.append("Current Store Meta (Stores -> Managers):")
for sid, meta in data.get("store_meta", {}).items():
    sname = data.get('stores', {}).get(sid, 'Unknown')
    output_lines.append(f"ID: {sid} | Name: {sname} | Manager: {meta.get('manager')} | City: {meta.get('city')} | Type: {meta.get('type')}")

with open("allorangedashboard/scratch/managers.txt", "w", encoding="utf-8") as f_out:
    f_out.write("\n".join(output_lines))

print("Successfully written to allorangedashboard/scratch/managers.txt")
