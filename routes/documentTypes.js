const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getDocumentTypeById,
  updateDocumentType,
} = require("../Utilities/documentTypesUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const documentTypesRef = db.ref("documentTypes");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active document types filtering
const filterActiveDocumentTypes = (types, activeOnly) => {
  if (activeOnly) {
    return types.filter((type) => type.isActive);
  }
  return types;
};

// Get all document types
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";

    const documentTypesSnapshot = await documentTypesRef.once("value");
    const documentTypes = documentTypesSnapshot.val();

    const filteredTypes = filterActiveDocumentTypes(
      Object.values(documentTypes),
      activeOnly
    );
    const totalPages = Math.ceil(filteredTypes.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedDocumentTypes = filteredTypes.slice(startIndex, endIndex);
    const formattedDocumentTypes = paginatedDocumentTypes.map((type) => ({
      ...type,
      lastUpdate: formatDateAndTime(type.lastUpdate),
    }));

    res.status(200).json({
      result: "OK",
      documentTypes: formattedDocumentTypes,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new Document Type
router.post("/", async (req, res) => {
  try {
    const { documentTypeName, expirable } = req.body;

    const documentTypesSnapshot = await documentTypesRef.once("value");

    let nextDocumentTypeId = 1;

    documentTypesSnapshot.forEach((childSnapshot) => {
      const documentTypeId = childSnapshot.val().documentTypeId;
      nextDocumentTypeId = Math.max(nextDocumentTypeId, documentTypeId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newDocumentType = {
        documentTypeId: nextDocumentTypeId,
        documentTypeName,
        expirable,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingTypeSnapshot = await documentTypesRef
        .orderByChild("documentTypeId")
        .equalTo(nextDocumentTypeId)
        .once("value");

      if (!existingTypeSnapshot.exists()) {
        const documentTypeRef = documentTypesRef.child(
          String(nextDocumentTypeId)
        );
        await documentTypeRef.set(newDocumentType);

        const response = {
          result: "OK",
          documentTypeId: nextDocumentTypeId,
          documentTypes: {
            documentTypeId: nextDocumentTypeId,
            documentTypeName,
            expirable,
            isActive: true,
            lastUpdate: formatDateAndTime(new Date()),
            updatedBy: DEFAULT_USER_EMAIL,
          },
        };

        res.status(201).json(response);
        break;
      }

      nextDocumentTypeId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Update document type by documentTypeId
router.put("/:documentTypeId", async (req, res) => {
  try {
    const requestedDocumentTypeId = req.params.documentTypeId;
    const updatedDocumentType = req.body;

    if ("documentTypeId" in updatedDocumentType) {
      res
        .status(400)
        .json({ result: "NG", message: "Cannot update documentTypeId" });
      return;
    }

    const now = new Date();
    const updatedFields = {
      ...updatedDocumentType,
      lastUpdate: formatDateAndTime(now),
      updatedBy: process.env.DEFAULT_USER_EMAIL || "current_user@example.com",
    };

    const documentTypeDetails = await getDocumentTypeById(
      requestedDocumentTypeId
    );

    if (documentTypeDetails) {
      const documentTypeId = Object.keys(documentTypeDetails)[0];
      await updateDocumentType(documentTypeId, updatedFields);

      const updatedResponseDocumentType = {
        documentTypeId: parseInt(documentTypeId),
        isActive: documentTypeDetails[documentTypeId].isActive,
        ...updatedFields,
      };

      res.status(200).json({
        result: "OK",
        documentType: updatedResponseDocumentType,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Document type not found" });
    }
  } catch (error) {
    res.status(500).json({ result: "NG", error: error.message });
  }
});

// Retrieve document type by documentTypeId
router.get("/:documentTypeId", async (req, res) => {
  try {
    const requestedDocumentTypeId = req.params.documentTypeId;
    const documentTypeDetails = await getDocumentTypeById(
      requestedDocumentTypeId
    );

    if (documentTypeDetails) {
      const documentTypeId = Object.keys(documentTypeDetails)[0];
      const formattedDocumentType = {
        documentTypeId: parseInt(documentTypeId),
        ...documentTypeDetails[documentTypeId],
        lastUpdate: formatDateAndTime(
          documentTypeDetails[documentTypeId].lastUpdate
        ),
      };

      res.status(200).json({
        result: "OK",
        documentType: formattedDocumentType,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Document type not found" });
    }
  } catch (error) {
    res.status(500).json({ result: "NG", error: error.message });
  }
});

// Delete document type by documentTypeId
router.delete("/:documentTypeId", async (req, res) => {
  try {
    const requestedDocumentTypeId = req.params.documentTypeId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const documentTypeDetails = await getDocumentTypeById(
      requestedDocumentTypeId
    );

    if (documentTypeDetails) {
      const documentTypeId = Object.keys(documentTypeDetails)[0];
      const actualLastUpdate = documentTypeDetails[documentTypeId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Update isActive to false in the database
      const updatedDocumentType = {
        ...documentTypeDetails[documentTypeId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
      };

      await updateDocumentType(documentTypeId, updatedDocumentType);

      // Prepare the response documentType object
      const responseDocumentType = {
        documentTypeId: parseInt(documentTypeId),
        ...updatedDocumentType,
      };

      res.status(200).json({
        result: "OK",
        documentType: responseDocumentType,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Document type not found" });
    }
  } catch (error) {
    res.status(500).json({ result: "NG", error: error.message });
  }
});

module.exports = router;
