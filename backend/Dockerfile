FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy dependency files
COPY pyproject.toml ./

# Create virtual environment and install dependencies
RUN uv venv /app/.venv && \
    . /app/.venv/bin/activate && \
    uv pip install -e ".[dev]"

# Copy application code
COPY . .

# Set PATH to include venv
ENV PATH="/app/.venv/bin:$PATH"

# Expose port
EXPOSE 8000

# Default command (can be overridden in docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
