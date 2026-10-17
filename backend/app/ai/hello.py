"""The first call: one question to Claude through Bedrock. make llm-hello."""

from app.ai.agenda import bedrock_client, model_options, uses_mantle
from app.config import get_settings


def main() -> None:
    model = get_settings().parser_model
    msg = bedrock_client(model).messages.create(
        model=model,
        max_tokens=1024,
        **model_options(model),  # effort "low" where the model supports it
        messages=[{"role": "user", "content": "In one sentence: what is an ISO week?"}],
    )
    print(next(b.text for b in msg.content if b.type == "text"))
    print(
        f"model={model} endpoint={'bedrock-mantle' if uses_mantle(model) else 'bedrock-runtime'} "
        f"stop_reason={msg.stop_reason} "
        f"input_tokens={msg.usage.input_tokens} output_tokens={msg.usage.output_tokens}"
    )


if __name__ == "__main__":
    main()
