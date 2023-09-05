const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getCompanyByCompanyId,
  updateCompany,
} = require("../Utilities/companiesUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const companiesRef = db.ref("companies");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: error.message });
};

// Middleware to handle active companies filtering
const filterActiveCompanies = (companies, activeOnly) => {
  if (activeOnly) {
    return companies.filter((company) => company.isActive);
  }
  return companies;
};

// Get all companies
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false"; // Default is true if not explicitly set to false
    const companyIdFilter = parseInt(req.query.company_id);
    const companyNameFilter = req.query.company_name;

    let companiesSnapshot = await companiesRef.once("value");
    let companies = companiesSnapshot.val();

    // Apply filters based on query parameters
    let filteredCompanies = Object.values(companies); // Start with all companies

    if (activeOnly) {
      filteredCompanies = filteredCompanies.filter(
        (company) => company.isActive
      );
    }

    if (!isNaN(companyIdFilter)) {
      filteredCompanies = filteredCompanies.filter(
        (company) => company.companyId === companyIdFilter
      );
    }

    if (companyNameFilter) {
      const lowercaseCompanyNameFilter = companyNameFilter.toLowerCase();
      filteredCompanies = filteredCompanies.filter((company) =>
        company.companyName.toLowerCase().includes(lowercaseCompanyNameFilter)
      );
    }

    // Pagination
    const totalPages = Math.ceil(filteredCompanies.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, filteredCompanies.length);
    const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);

    const formattedCompanies = paginatedCompanies.map((company) => ({
      ...company,
      lastUpdate: formatDateAndTime(company.lastUpdate),
    }));

    res.status(200).json({
      result: "OK",
      companies: formattedCompanies,
      // totalPages,
      // currentPage: page,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new Company
router.post("/", async (req, res) => {
  try {
    const { dailyReportCompanyId, companyName } = req.body;

    const companiesSnapshot = await companiesRef.once("value");

    let nextCompanyId = 1;

    companiesSnapshot.forEach((childSnapshot) => {
      const companyId = childSnapshot.val().companyId;
      nextCompanyId = Math.max(nextCompanyId, companyId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newCompany = {
        companyId: nextCompanyId,
        dailyReportCompanyId,
        companyName,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingCompanySnapshot = await companiesRef
        .orderByChild("companyId")
        .equalTo(nextCompanyId)
        .once("value");

      if (!existingCompanySnapshot.exists()) {
        const companyRef = companiesRef.child(String(nextCompanyId));
        await companyRef.set(newCompany);

        const response = {
          result: "OK",
          companyId: nextCompanyId,
          company: newCompany,
        };

        res.status(201).json(response);
        break;
      }

      nextCompanyId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Retrieve company by companyId
router.get("/:companyId", async (req, res) => {
  try {
    const requestedCompanyId = req.params.companyId;
    const companyDetails = await getCompanyByCompanyId(requestedCompanyId);

    if (companyDetails) {
      const companyId = Object.keys(companyDetails)[0];
      const formattedCompany = {
        companyId: parseInt(companyId),
        ...companyDetails[companyId],
        lastUpdate: formatDateAndTime(companyDetails[companyId].lastUpdate),
      };

      res.status(200).json({
        result: "OK",
        company: formattedCompany,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Company not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Update company by companyId
router.put("/:companyId", async (req, res) => {
  try {
    const requestedCompanyId = req.params.companyId;
    const updatedCompany = req.body;

    // Prevent updating companyId directly
    if ("companyId" in updatedCompany) {
      res.status(400).json({ message: "Cannot update companyId" });
      return;
    }

    // Adding lastUpdate and updatedBy to the updatedCompany object
    const now = new Date();
    updatedCompany.lastUpdate = formatDateAndTime(now);
    updatedCompany.updatedBy = DEFAULT_USER_EMAIL || "current_user@example.com"; // Replace with actual user info

    const companyDetails = await getCompanyByCompanyId(requestedCompanyId);

    if (companyDetails) {
      const companyId = Object.keys(companyDetails)[0];
      await updateCompany(companyId, updatedCompany);

      // Prepare the updated company object for response
      const updatedResponseCompany = {
        ...updatedCompany,
        companyId: parseInt(companyId),
      };

      res.status(200).json({
        result: "OK",
        company: updatedResponseCompany,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Company not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete company by companyId
router.delete("/:companyId", async (req, res) => {
  try {
    const requestedCompanyId = req.params.companyId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const companyDetails = await getCompanyByCompanyId(requestedCompanyId);

    if (companyDetails) {
      const companyId = Object.keys(companyDetails)[0];
      const actualLastUpdate = companyDetails[companyId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the company as inactive and update necessary fields
      const updatedCompany = {
        ...companyDetails[companyId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: process.env.DEFAULT_USER_EMAIL || "current_user@example.com", // Replace with actual user info
      };

      await updateCompany(companyId, updatedCompany);

      res.status(200).json({
        result: "OK",
        company: updatedCompany,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Company not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
