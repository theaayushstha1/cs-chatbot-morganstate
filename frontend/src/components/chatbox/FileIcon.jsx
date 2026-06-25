import { FaFile } from "@react-icons/all-files/fa/FaFile";
import { FaFileImage } from "@react-icons/all-files/fa/FaFileImage";
import { FaFilePdf } from "@react-icons/all-files/fa/FaFilePdf";
import { FaFileWord } from "@react-icons/all-files/fa/FaFileWord";

export function getFileIcon(filename) {
  if (!filename) return <FaFile className="file-icon generic" />;
  const ext = filename.split(".").pop().toLowerCase();

  if (ext === "pdf") return <FaFilePdf className="file-icon pdf" />;
  if (["doc", "docx"].includes(ext)) return <FaFileWord className="file-icon word" />;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
    return <FaFileImage className="file-icon image" />;
  }

  return <FaFile className="file-icon generic" />;
}
