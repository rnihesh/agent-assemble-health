FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/agent

COPY agent/pyproject.toml /app/agent/pyproject.toml
COPY agent/agent_card.json /app/agent/agent_card.json
COPY agent/medassist /app/agent/medassist

RUN pip install --no-cache-dir .

EXPOSE 8001

CMD ["uvicorn", "medassist.main:app", "--host", "0.0.0.0", "--port", "8001"]
