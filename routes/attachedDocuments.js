const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");

const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const attachedDocumentsRef = db.ref("attachedDocuments");
const documentTypesRef = db.ref("documentTypes");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

router.post("/", async (req, res) => {
  try {
    const { staffId, documentTypeId, expiryDate } = req.body;

    const attachedDocumentsSnapshot = await attachedDocumentsRef.once("value");

    let nextAttachedDocumentId = 1;

    attachedDocumentsSnapshot.forEach((childSnapshot) => {
      const existingAttachedDocumentId = childSnapshot.val().attachedDocumentId;
      nextAttachedDocumentId = Math.max(
        nextAttachedDocumentId,
        existingAttachedDocumentId + 1
      );
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newAttachedDocument = {
        staffId,
        attachedDocumentId: nextAttachedDocumentId,
        documentTypeId,
        expiryDate,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingAttachedDocumentSnapshot = await attachedDocumentsRef
        .orderByChild("attachedDocumentId")
        .equalTo(nextAttachedDocumentId)
        .once("value");

      if (!existingAttachedDocumentSnapshot.exists()) {
        const attachedDocumentRef = attachedDocumentsRef.child(
          String(nextAttachedDocumentId)
        );
        await attachedDocumentRef.set(newAttachedDocument);

        const documentTypeSnapshot = await documentTypesRef
          .child(String(documentTypeId))
          .once("value");
        const documentType = documentTypeSnapshot.val();

        const response = {
          result: "OK",
          attachedDocumentId: nextAttachedDocumentId,
          attachedDocument: {
            staffId,
            attachedDocumentId: nextAttachedDocumentId,
            documentTypeId,
            expiryDate,
            isActive: newAttachedDocument.isActive,
            lastUpdate: formatDateAndTime(newAttachedDocument.lastUpdate),
            updatedBy: newAttachedDocument.updatedBy,
          },
          documentType: {
            documentTypeId: documentType.documentTypeId,
            documentTypeName: documentType.documentTypeName,
            expirable: documentType.expirable,
            isActive: documentType.isActive,
            lastUpdate: formatDateAndTime(documentType.lastUpdate),
            updatedBy: documentType.updatedBy,
          },
        };

        res.status(201).json(response);
        break;
      }

      nextAttachedDocumentId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    res.status(500).json({ result: "NG", error: "Internal Server Error" });
  }
});

module.exports = router;
