from pydantic import BaseModel


class PayeeAliasUpsert(BaseModel):
    raw: str
    alias: str


class PayeeAliasResponse(BaseModel):
    raw: str
    alias: str

    model_config = {"from_attributes": True}
