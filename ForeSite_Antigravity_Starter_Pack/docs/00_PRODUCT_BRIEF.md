# Product brief

ForeSite is a site-inspection workspace for an inspector/supervisor. The core workflow is: create a project and inspection; add an image and contextual notes; store the original image locally in IndexedDB; invoke Firebase AI Logic hybrid inference; validate and display an AI-generated inspection draft; let the inspector edit, approve, or reject it; save structured data to Firestore when authenticated and online.

AI may draft a neutral visible-observation summary, suggest a category, list uncertainty, and propose follow-up questions. It must not diagnose structural failure, infer hidden conditions or measurements, declare a site safe/unsafe, or certify code/regulatory compliance. Human review is mandatory.

Value proposition to validate with real users: reduce clerical effort in turning field observations into structured drafts while keeping the inspector in control and original photos local by default.
