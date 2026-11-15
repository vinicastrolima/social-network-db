import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
// Exportação opt-in: nenhuma conta externa ou conteúdo privado é enviado por padrão.
export const telemetry = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  ? new NodeSDK({
      serviceName: "devconnect",
      traceExporter: new OTLPTraceExporter(),
      autoDetectResources: false,
    })
  : null;
telemetry?.start();
