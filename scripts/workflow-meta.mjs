// Human-written descriptions shown in the viewer. Keyed by file name in workflows/.
export const META = {
  'api-pagination-to-csv-report.json': {
    title: 'API pagination to CSV report',
    kind: 'showcase',
    summary: 'Every morning, pulls yesterday\'s orders from a REST API page by page, flattens the pages, normalises each row, builds a CSV file and a totals row (count + revenue), merges them and uploads the report to a delivery endpoint with a bearer header.',
    steps: ['Schedule Trigger fires daily at 07:00', 'Config node reads base URL from env and computes the report date', 'HTTP Request pages through /orders using n8n\'s built-in pagination (page counter, stops on a short page)', 'Split Out flattens each page\'s data array into items', 'Set node maps API fields to flat CSV columns', 'Convert to File builds the CSV; Summarize computes count and sum in parallel', 'Merge combines file + totals; HTTP Request POSTs multipart with Authorization header and retry on fail'],
    env: ['REPORT_API_BASE_URL', 'REPORT_API_TOKEN', 'REPORT_DELIVERY_URL'],
    patterns: ['Schedule trigger', 'HTTP pagination', 'Data transformation', 'Merge / aggregate', 'Header auth', 'Retry on fail'],
  },
  'authenticated-webhook-intake.json': {
    title: 'Authenticated webhook intake',
    kind: 'showcase',
    summary: 'A POST webhook that rejects callers without the right x-api-key (401), validates the body (400), then normalises the submission, enriches it through a sub-workflow, stores it in an n8n Data Table and answers 200 with a ticket reference.',
    steps: ['Webhook receives POST /intake and defers the response to Respond to Webhook nodes', 'IF compares the x-api-key header to an env secret; mismatch -> 401', 'IF validates name, email format and message; failure -> 400', 'Set trims and lowercases fields', 'Execute Workflow calls the enrich sub-workflow (priority + ticket reference)', 'Data Table insert persists the row', 'Respond to Webhook returns 200 JSON'],
    env: ['INTAKE_API_KEY', 'Data Table ID (placeholder in node)', 'Sub-workflow ID (placeholder in node)'],
    patterns: ['Webhooks + auth', 'Branching (IF)', 'Validation', 'Sub-workflows', 'Data Tables', 'HTTP status codes'],
  },
  'sub-workflow-enrich-submission.json': {
    title: 'Sub-workflow: enrich submission',
    kind: 'helper',
    summary: 'Helper called by the webhook intake workflow. Scores priority from keywords and adds a ticket reference in a Code node. Import this first and copy its ID into the parent\'s Execute Workflow node.',
    steps: ['Execute Workflow Trigger receives the parent\'s items', 'Code node adds priority and ticketRef and returns the items'],
    env: [],
    patterns: ['Sub-workflows', 'Code node'],
  },
  'error-alert-workflow.json': {
    title: 'Error alert and retry with backoff',
    kind: 'showcase',
    summary: 'Two patterns in one file. (A) A global error workflow: Error Trigger -> formatted message -> Slack-shaped webhook notification. (B) A retry loop with exponential backoff and jitter around a flaky API call that gives up with Stop and Error, which in turn fires the alert.',
    steps: ['A: Error Trigger receives workflow, execution and error details', 'A: Set builds the alert text; HTTP Request posts it (retry on fail)', 'B: Manual trigger seeds attempt counter', 'B: HTTP Request has an error output; failures go to the "attempts left?" IF', 'B: Code computes base * 2^attempt + jitter; Wait pauses; loop returns to the call', 'B: Out of attempts -> Stop and Error'],
    env: ['ALERT_WEBHOOK_URL', 'FLAKY_API_URL'],
    patterns: ['Error workflows', 'Retries + backoff', 'Error output branches', 'Loops', 'Wait node'],
  },
  'ai-feedback-classifier.json': {
    title: 'AI feedback classifier',
    kind: 'showcase',
    summary: 'Webhook that classifies customer feedback with a local Ollama model through a Basic LLM Chain and a Structured Output Parser (JSON schema with enums for sentiment, category, urgency). High urgency notifies on-call; LLM failure is handled on the chain\'s error output with a 503.',
    steps: ['Webhook receives POST /feedback', 'IF rejects an empty message with 400', 'Basic LLM Chain + Ollama Chat Model + Structured Output Parser classify the text', 'Success: Set shapes the result; IF routes urgency=high to an HTTP notification', 'Error output: fallback payload flagged needs_human_review, responds 503', 'Respond to Webhook returns the classification'],
    env: ['ALERT_WEBHOOK_URL', 'Ollama credential (base URL)'],
    patterns: ['Webhooks', 'AI structured output', 'Local LLM (Ollama)', 'Branching', 'Error branch'],
  },
  'ai-agent-with-tools.json': {
    title: 'AI agent with tools and memory',
    kind: 'showcase',
    summary: 'A chat agent on a local Ollama model with window-buffer memory and two tools: an HTTP Request tool for exchange rates (placeholder API) and a Calculator. The system prompt tells it to use tools rather than guess.',
    steps: ['Chat Trigger provides the chat UI and session id', 'AI Agent runs the tool-calling loop (max 6 iterations)', 'Ollama Chat Model supplies the LLM', 'Window Buffer Memory keeps the last 8 turns per session', 'HTTP Request tool and Calculator tool are callable by the model'],
    env: ['Ollama credential (base URL)', 'Exchange-rate API URL (placeholder in tool node)'],
    patterns: ['AI agents', 'Tools', 'Memory', 'Local LLM (Ollama)'],
  },
};
export const ORDER = ['api-pagination-to-csv-report.json', 'authenticated-webhook-intake.json', 'error-alert-workflow.json', 'ai-feedback-classifier.json', 'ai-agent-with-tools.json', 'sub-workflow-enrich-submission.json'];
