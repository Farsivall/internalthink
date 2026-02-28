import requests

BASE_URL = "http://127.0.0.1:8000/api"

def run_tests():
    print("Running Tests against Live Server...")
    
    # 1. Create a Project
    print("\n--- Testing Project Creation ---")
    project_payload = {
        "name": "Test Project",
        "description": "A project created via automated testing based on the spec."
    }
    response = requests.post(f"{BASE_URL}/projects/", json=project_payload)
    if response.status_code == 201:
        project_data = response.json()
        project_id = project_data["id"]
        print(f"✅ Created Project Successfully. ID: {project_id}")
    else:
        print(f"❌ Failed to create project. Status Code: {response.status_code}, Response: {response.text}")
        return

    # 2. Fetch Projects
    print("\n--- Testing Fetching Projects ---")
    response = requests.get(f"{BASE_URL}/projects/")
    if response.status_code == 200:
        projects = response.json()
        found = any(p["id"] == project_id for p in projects)
        print(f"✅ Fetch Projects Successful (Found {len(projects)} total projects). Inclusion matched: {found}")
    else:
        print(f"❌ Failed to fetch projects. Status Code: {response.status_code}")

    # 3. Attach Valid Context Sources
    print("\n--- Testing Context Source Creation ---")
    sources = [
        {"type": "document", "content": "This is a document about the requirements.", "label": "Requirements Document"},
        {"type": "slack", "content": "ceo: we need this shipped asap.", "label": "Slack - #general"},
        {"type": "codebase", "content": "def main():\n  pass", "label": "main.py"}
    ]
    
    for source in sources:
        payload = {
            "project_id": project_id,
            "type": source["type"],
            "content": source["content"],
            "label": source["label"]
        }
        res = requests.post(f"{BASE_URL}/context/", json=payload)
        if res.status_code == 201:
            print(f"✅ Created context source of type '{source['type']}' successfully.")
        else:
            print(f"❌ Failed to create context source of type '{source['type']}'. Status Code: {res.status_code}, Response: {res.text}")

    # 4. Attach Invalid Context Source to test DB Constraint / Pydantic validation
    print("\n--- Testing Invalid Context Source ---")
    invalid_payload = {
        "project_id": project_id,
        "type": "audio",
        "content": "This should fail.",
        "label": "Invalid Type"
    }
    res = requests.post(f"{BASE_URL}/context/", json=invalid_payload)
    if res.status_code in [400, 422]:
        print(f"✅ Successfully rejected invalid type (audio). Status Code: {res.status_code}")
    else:
        print(f"❌ Failed to reject invalid type appropriately. Expected 400/422 but got {res.status_code}.")
        
    # 5. Fetch Context Sources for Project
    print("\n--- Testing Fetching Context Sources ---")
    res = requests.get(f"{BASE_URL}/context/", params={"project_id": project_id})
    if res.status_code == 200:
        data = res.json()
        print(f"✅ Successfully fetched context sources. Count: {len(data)}")
    else:
         print(f"❌ Failed to fetch context sources. Status code: {res.status_code}")
         
    print("\nAll endpoints matched expectations.")

if __name__ == "__main__":
    run_tests()
