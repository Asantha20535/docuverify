# Signature Placement QA

Steps to verify the new role-based signature stamping:

1. **Prepare document**
   - Log in as `course_unit` (or another uploader) and submit a PDF for a student request.
   - Confirm the document's `filePath` exists in `uploads/`.

2. **Apply signature**
   - Log in as the first reviewer (e.g., `academic_staff`).
   - Open the pending document, add a signature from the pad, and approve/forward.

3. **Validate PDF output**
   - Download the updated PDF from `/api/documents/:id/content`.
   - Open it locally and confirm the signature renders in the expected block for that role.

4. **Repeat for downstream roles**
   - Continue the workflow (department head, dean, etc.), ensuring each signature lands in the predefined block.

5. **Verify metadata**
   - Use the database (or an admin endpoint) to confirm `documents.fileMetadata.signaturePlacements` is updated with role, page, and coordinate info.

6. **Integrity checks**
   - Confirm the document hash in the UI/API changes after each signature (students will share the final hash).
   - Re-run verification portal with the new hash to ensure it matches the updated PDF.

Troubleshooting tips:

- If a signature fails to appear, confirm the captured value starts with `data:image/`.
- Ensure the document is a PDF; other mime types bypass placement.
- Server logs now report `Signature placement error` when pdf-lib fails—check logs for details.

