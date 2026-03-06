#!/bin/bash
set -e

FHIR_BASE="${FHIR_BASE_URL:-http://hapi.fhir.org/baseR4}"
DATA_DIR="${1:-./synthea-output/fhir}"

if [ ! -d "$DATA_DIR" ]; then
    echo "Usage: $0 <synthea-fhir-output-dir>"
    echo "Generate data first: synthea -p 10 --exporter.fhir.export=true"
    exit 1
fi

echo "Loading Synthea FHIR bundles into $FHIR_BASE..."

for bundle in "$DATA_DIR"/*.json; do
    echo "Loading $(basename "$bundle")..."
    curl -s -X POST "$FHIR_BASE" \
        -H "Content-Type: application/fhir+json" \
        -d @"$bundle" \
        -o /dev/null -w "  HTTP %{http_code}\n"
done

echo "Done loading Synthea data."
