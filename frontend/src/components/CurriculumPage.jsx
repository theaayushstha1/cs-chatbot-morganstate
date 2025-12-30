import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "@react-icons/all-files/fa/FaArrowLeft";
import { FaSearch } from "@react-icons/all-files/fa/FaSearch";
import { FaFilter } from "@react-icons/all-files/fa/FaFilter";
import { FaBook } from "@react-icons/all-files/fa/FaBook";
import { FaGraduationCap } from "@react-icons/all-files/fa/FaGraduationCap";
import "./CurriculumPage.css";

const curriculumData = [
  // Mathematics Courses
  { code: "MATH 241", name: "Calculus I", credits: 4, category: "Mathematics", prereq: "ENGR 101, MATH 114, MATH 141, Departmental permission", offered: "Fall, Spring" },
  { code: "MATH 242", name: "Calculus II", credits: 4, category: "Mathematics", prereq: "MATH 241 (Grade 'C' or higher), Departmental permission", offered: "Fall, Spring" },
  { code: "MATH 312", name: "Linear Algebra I", credits: 3, category: "Mathematics", prereq: "MATH 241 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "MATH 313", name: "Linear Algebra II", credits: 3, category: "Mathematics", prereq: "MATH 312 (Grade 'C' or higher), MATH 312 (Grade 'C' or higher) with TR", offered: "Fall, Spring" },
  { code: "MATH 331", name: "Applied Probability and Statistics", credits: 3, category: "Mathematics", prereq: "MATH 242 (Grade 'C' or higher)", offered: "Fall, Spring" },
  
  // Core Computer Science
  { code: "COSC 111", name: "Introduction to Computer Science I", credits: 4, category: "Core CS", prereq: "None", offered: "Fall, Spring" },
  { code: "COSC 112", name: "Introduction to Computer Science II", credits: 4, category: "Core CS", prereq: "COSC 111 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 220", name: "Data Structures and Algorithms Analysis", credits: 4, category: "Core CS", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 241", name: "Computer Systems & Digital Logic", credits: 3, category: "Core CS", prereq: "COSC 112, MATH 141 (Grade 'C' or higher), Departmental permission", offered: "Fall, Spring" },
  { code: "COSC 281", name: "Discrete Structures", credits: 3, category: "Core CS", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  
  // Advanced Computer Science
  { code: "COSC 349", name: "Computer Networks", credits: 3, category: "Advanced CS", prereq: "COSC 243 (Grade 'C' or higher for Fall 2024), COSC 112 (Grade 'C' or higher for Spring 2025)", offered: "As Needed" },
  { code: "COSC 351", name: "Foundations of Computer Security and Information Assurance", credits: 3, category: "Advanced CS", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 352", name: "Organization of Programming Languages", credits: 3, category: "Advanced CS", prereq: "COSC 220 (Grade 'C' or higher), COSC 220 with minimum grade of TR", offered: "Fall, Spring" },
  { code: "COSC 354", name: "Operating Systems", credits: 3, category: "Advanced CS", prereq: "COSC 220 (Grade 'C' or higher), COSC 241 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 458", name: "Parallel Algorithms or Software Engineering", credits: 3, category: "Advanced CS", prereq: "COSC 220 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 459", name: "Database Design", credits: 3, category: "Advanced CS", prereq: "COSC 220 (Grade 'C' or higher)", offered: "Fall, Spring" },
  
  // Specialized Courses
  { code: "COSC 238", name: "Object Oriented Programming", credits: 4, category: "Specialized", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "CLCO 261", name: "Intro to Cloud Computing", credits: 3, category: "Specialized", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 385", name: "Theory of Language and Automata", credits: 3, category: "Specialized", prereq: "COSC 220, COSC 281 (Grade 'C' or higher)", offered: "As Needed" },
  { code: "COSC 239", name: "JAVA Programming", credits: 3, category: "Specialized", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 243", name: "Computer Architecture", credits: 3, category: "Specialized", prereq: "COSC 241 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 251", name: "Introduction to Data Science", credits: 3, category: "Specialized", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 320", name: "Algorithm Design and Analysis", credits: 3, category: "Specialized", prereq: "COSC 220 (Grade 'C' or higher), COSC 281 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 323", name: "Introduction to Cryptography", credits: 3, category: "Specialized", prereq: "COSC 238 (Grade 'C' or higher), MATH 312 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 332", name: "Introduction to Game Design and Development", credits: 3, category: "Specialized", prereq: "COSC 112 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 338", name: "Mobile App Design and Development", credits: 3, category: "Specialized", prereq: "COSC 238 (Grade 'C' or higher)", offered: "Fall, Spring" },
  { code: "COSC 383", name: "Num Methods and Programming", credits: 3, category: "Specialized", prereq: "MATH 242 (Grade 'C' or higher)", offered: "Fall, Spring" },
];

export default function CurriculumPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedSemester, setSelectedSemester] = useState("All");

  // 🔥 DEBUG CODE - Remove after testing 🔥
  React.useEffect(() => {
    console.log("✅ CurriculumPage MOUNTED!");
    console.log("📍 Current path:", window.location.pathname);
    console.log("📊 Total courses:", curriculumData.length);
  }, []);

  const categories = ["All", "Mathematics", "Core CS", "Advanced CS", "Specialized"];
  const semesters = ["All", "Fall", "Spring", "As Needed"];

  const filteredCourses = curriculumData.filter((course) => {
    const matchesSearch = 
      course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.prereq.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === "All" || course.category === selectedCategory;
    const matchesSemester = selectedSemester === "All" || course.offered.includes(selectedSemester);
    
    return matchesSearch && matchesCategory && matchesSemester;
  });

  return (
    <div className="curriculum-page">
      {/* Header Section */}
      <div className="curriculum-header">
        <div className="header-content">
          <button className="back-btn" onClick={() => navigate("/")}>
            <FaArrowLeft size={18} />
            <span>Back to Chat</span>
          </button>
          
          <div className="header-title">
            <FaGraduationCap size={40} className="header-icon" />
            <div>
              <h1>Computer Science Curriculum</h1>
              <p>Morgan State University - Bachelor of Science Program</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="stats-section">
        <div className="stat-card">
          <FaBook size={24} />
          <div>
            <div className="stat-number">{curriculumData.length}</div>
            <div className="stat-label">Total Courses</div>
          </div>
        </div>
        <div className="stat-card">
          <FaGraduationCap size={24} />
          <div>
            <div className="stat-number">{curriculumData.reduce((sum, c) => sum + c.credits, 0)}</div>
            <div className="stat-label">Total Credits</div>
          </div>
        </div>
        <div className="stat-card">
          <FaFilter size={24} />
          <div>
            <div className="stat-number">{filteredCourses.length}</div>
            <div className="stat-label">Filtered Results</div>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="filters-section">
        <div className="search-bar">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search courses by code, name, or prerequisites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label>Category:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Semester:</label>
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="filter-select"
          >
            {semesters.map((sem) => (
              <option key={sem} value={sem}>
                {sem}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Courses Table */}
      <div className="table-container">
        <table className="curriculum-table">
          <thead>
            <tr>
              <th>Course Code</th>
              <th>Course Name</th>
              <th>Credits</th>
              <th>Category</th>
              <th>Prerequisites</th>
              <th>Offered</th>
            </tr>
          </thead>
          <tbody>
            {filteredCourses.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-state">
                  No courses found matching your criteria
                </td>
              </tr>
            ) : (
              filteredCourses.map((course) => (
                <tr key={course.code}>
                  <td className="course-code">{course.code}</td>
                  <td className="course-name">{course.name}</td>
                  <td className="course-credits">{course.credits}</td>
                  <td>
                    <span className={`category-badge ${course.category.replace(/\s+/g, '-').toLowerCase()}`}>
                      {course.category}
                    </span>
                  </td>
                  <td className="course-prereq">{course.prereq}</td>
                  <td className="course-offered">{course.offered}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
