from app.schemas.context import ContextSourceCreate
from pydantic import ValidationError
from uuid import uuid4

def test_validation():
    try:
        ContextSourceCreate(
            project_id=uuid4(),
            type="document",
            content="test"
        )
        print("Valid type 'document' passed.")
    except Exception as e:
        print("Error on valid type:", e)

    try:
        ContextSourceCreate(
            project_id=uuid4(),
            type="invalid_type",
            content="test"
        )
        print("Invalid type passed unexpectedly.")
    except ValidationError as e:
        print("Invalid type correctly caught by Pydantic.")

if __name__ == "__main__":
    test_validation()
