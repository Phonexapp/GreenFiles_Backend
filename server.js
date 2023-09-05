// Import the `dotenv` package
require("dotenv").config();

const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cors = require("cors");
app.use(cors());

const signUpRouter = require("./userAuthentication/signUp");
app.use("/signup", signUpRouter);

const staffRouter = require("./routes/staff");
app.use("/staffs", staffRouter);

const attachedDocumentRouter = require("./routes/attachedDocuments");
app.use("/attachedDocuments", attachedDocumentRouter);

const jobCategoryRouter = require("./routes/jobCategories");
app.use("/jobCategories", jobCategoryRouter);

const companiesRouter = require("./routes/companies");
app.use("/companies", companiesRouter);

const officialPositionRouter = require("./routes/officialPositions");
app.use("/officialPositions", officialPositionRouter);

const specialEduactionRouter = require("./routes/specialEducations");
app.use("/specialEducations", specialEduactionRouter);

const licenseRouter = require("./routes/license");
app.use("/licenses", licenseRouter);

const licenseTypesRouter = require("./routes/licenseTypes");
app.use("/licenseTypes", licenseTypesRouter);

const skillTrainingsRouter = require("./routes/skillTrainings");
app.use("/skillTrainings", skillTrainingsRouter);

const documentTypesRouter = require("./routes/documentTypes");
app.use("/documentTypes", documentTypesRouter);

const projectTypesRouter = require("./routes/projectTypes");
app.use("/projectTypes", projectTypesRouter);

const projectsRouter = require("./routes/projects");
app.use("/projects", projectsRouter);

const transferRouter = require("./routes/transfer");
app.use("/transfers", transferRouter);

const login = require("./userAuthentication/login");
app.use("/userlogin", login);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start the Express server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
