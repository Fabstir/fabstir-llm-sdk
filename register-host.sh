#!/bin/bash
# Register Fabstir Host

# Use TEST_HOST_2_PRIVATE_KEY from .env.test inside container
docker exec -it fabstir-host-test sh -c 'node --require /app/polyfills.js dist/index.js register --url http://localhost:8083 --models "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" --stake 1000 --private-key $TEST_HOST_2_PRIVATE_KEY'
