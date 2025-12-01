import React, { useState } from 'react';
import { Assessment, StudentSubmission } from '../types';
import { Button } from '../components/Button';
import { FileUpload } from '../components/FileUpload';
import { Icons } from '../components/Icon';
import { parseStudentRoster, identifyStudentRanges } from '../services/geminiService';
import { splitPdfByRanges, blobToBase64, SplitRange } from '../services/pdfSplittingService';

interface StudentSetupProps {
  assessment: Assessment;
  onUpdate: (assessment: Assessment) => void;
  onNext: () => void;
  onBack: () => void;
}

export const StudentSetup: React.FC<StudentSetupProps> = ({ assessment, onUpdate, onNext, onBack }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  
  // Bulk Split State
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [detectedRanges, setDetectedRanges] = useState<SplitRange[]>([]);
  const [splitStage, setSplitStage] = useState<'UPLOAD' | 'ANALYZING' | 'CONFIRM' | 'PROCESSING'>('UPLOAD');

  const handleStudentSubmissionUpload = (file: File, studentId?: string) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      
      if (studentId) {
        // Attach file to existing student (from roster)
        const updatedStudents = assessment.students.map(s => 
          s.id === studentId ? { 
            ...s, 
            fileName: file.name,
            fileType: file.type,
            fileData: base64
          } : s
        );
        onUpdate({ ...assessment, students: updatedStudents });
      } else {
        // Create new student from file
        const newStudent: StudentSubmission = {
          id: `s-${Date.now()}-${Math.random()}`,
          studentName: file.name.split('.')[0], 
          fileName: file.name,
          fileType: file.type,
          fileData: base64,
          grades: {},
          status: 'PENDING',
          totalScore: 0
        };
        onUpdate({ ...assessment, students: [...assessment.students, newStudent] });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRosterImport = async (file: File) => {
    setIsProcessing(true);
    setImportError(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const names = await parseStudentRoster(base64, file.type);
          if (names.length === 0) {
            setImportError("No names found in the document.");
            return;
          }

          const newStudents: StudentSubmission[] = names.map((name, idx) => ({
            id: `s-${Date.now()}-${idx}`,
            studentName: name,
            fileName: '',
            fileType: '',
            fileData: null,
            grades: {},
            status: 'PENDING',
            totalScore: 0
          }));

          onUpdate({ ...assessment, students: [...assessment.students, ...newStudents] });
        } catch (e) {
          setImportError("Failed to parse roster. Please check the file format.");
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setImportError("Error reading file.");
      setIsProcessing(false);
    }
  };

  // --- Bulk Split Logic ---

  const startBulkSplit = async (file: File) => {
    setBulkFile(file);
    setSplitStage('ANALYZING');
    
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const ranges = await identifyStudentRanges(base64, file.type);
        setDetectedRanges(ranges);
        setSplitStage('CONFIRM');
      } catch (err) {
        setImportError("Failed to analyze PDF structure.");
        setSplitStage('UPLOAD');
      }
    };
    reader.readAsDataURL(file);
  };

  const finalizeSplit = async () => {
    if (!bulkFile || detectedRanges.length === 0) return;
    setSplitStage('PROCESSING');

    try {
      const results = await splitPdfByRanges(bulkFile, detectedRanges);
      
      const newStudents: StudentSubmission[] = [];
      
      for (const res of results) {
        const base64 = await blobToBase64(res.blob);
        newStudents.push({
          id: `s-${Date.now()}-${Math.random()}`,
          studentName: res.studentName,
          fileName: `${res.studentName.replace(/\s+/g, '_')}_work.pdf`,
          fileType: 'application/pdf',
          fileData: base64,
          grades: {},
          status: 'PENDING',
          totalScore: 0
        });
      }

      onUpdate({ ...assessment, students: [...assessment.students, ...newStudents] });
      setShowSplitModal(false);
      setBulkFile(null);
      setDetectedRanges([]);
      setSplitStage('UPLOAD');
    } catch (err) {
      console.error(err);
      setImportError("Failed to split PDF file.");
      setSplitStage('CONFIRM');
    }
  };

  const removeStudent = (id: string) => {
    onUpdate({ ...assessment, students: assessment.students.filter(s => s.id !== id) });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Step 2: Add Students</h2>
          <p className="text-gray-500">Import a class roster, bulk split PDFs, or upload individually.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button onClick={onNext} disabled={assessment.students.length === 0} className="gap-2">
            Start Grading <Icons.ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Bulk Roster Import */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col hover:border-indigo-200 transition-colors">
          <div className="flex items-center gap-3 mb-4 text-blue-700">
             <div className="p-2 bg-blue-50 rounded-lg">
                <Icons.FileSpreadsheet className="w-5 h-5" />
             </div>
             <h3 className="font-semibold text-lg">Import Roster</h3>
          </div>
          <p className="text-sm text-gray-500 mb-6 flex-1">
             Upload a list of names (PDF/CSV) to create empty student slots.
          </p>
          {isProcessing ? (
             <div className="text-center text-sm text-gray-500 py-4">Processing...</div>
          ) : (
             <FileUpload onFileSelect={handleRosterImport} label="Upload List" accept=".pdf,.csv,.xlsx,image/*" compact />
          )}
        </div>

        {/* Card 2: Bulk Split PDF */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-6 flex flex-col shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-indigo-700">
             <div className="p-2 bg-white rounded-lg shadow-sm">
                <Icons.Scissors className="w-5 h-5" />
             </div>
             <h3 className="font-semibold text-lg">Bulk Split PDF</h3>
          </div>
          <p className="text-sm text-gray-600 mb-6 flex-1">
             Upload one large PDF containing all student work. I'll split it by student name/page automatically.
          </p>
          <Button onClick={() => setShowSplitModal(true)} className="w-full gap-2">
            <Icons.Layers className="w-4 h-4" /> Split & Import
          </Button>
        </div>

        {/* Card 3: Direct Upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col hover:border-indigo-200 transition-colors">
          <div className="flex items-center gap-3 mb-4 text-gray-800">
             <div className="p-2 bg-gray-100 rounded-lg">
                <Icons.Upload className="w-5 h-5" />
             </div>
             <h3 className="font-semibold text-lg">Single Upload</h3>
          </div>
          <p className="text-sm text-gray-500 mb-6 flex-1">
             Upload individual files one by one. I'll name them based on the file.
          </p>
          <FileUpload onFileSelect={(f) => handleStudentSubmissionUpload(f)} label="Upload File" compact />
        </div>
      </div>

      {importError && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2">
          <Icons.AlertCircle className="w-5 h-5" /> {importError}
        </div>
      )}

      {/* Student List */}
      {assessment.students.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h4 className="font-semibold text-gray-700">Students ({assessment.students.length})</h4>
            <Button variant="ghost" size="sm" onClick={() => onUpdate({ ...assessment, students: [] })} className="text-red-500 hover:text-red-600 hover:bg-red-50">
               Clear All
            </Button>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {assessment.students.map(student => (
              <div key={student.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                    ${student.fileData ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'}
                  `}>
                    {student.studentName.charAt(0)}
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900">{student.studentName}</h5>
                    {student.fileName ? (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <Icons.CheckCircle className="w-3 h-3" /> {student.fileName}
                      </p>
                    ) : (
                      <p className="text-xs text-orange-500 flex items-center gap-1">
                        <Icons.AlertCircle className="w-3 h-3" /> No submission uploaded
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!student.fileData && (
                    <div className="relative">
                      <input 
                        type="file" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleStudentSubmissionUpload(e.target.files[0], student.id);
                        }}
                      />
                      <Button size="sm" variant="outline" className="gap-1">
                        <Icons.Upload className="w-3 h-3" /> Upload Work
                      </Button>
                    </div>
                  )}
                  {student.fileData && (
                     <div className="relative">
                       <input 
                         type="file" 
                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                         onChange={(e) => {
                           if (e.target.files?.[0]) handleStudentSubmissionUpload(e.target.files[0], student.id);
                         }}
                       />
                       <Button size="sm" variant="ghost" className="text-gray-400 hover:text-indigo-600">
                         Replace
                       </Button>
                     </div>
                  )}
                  <button 
                    onClick={() => removeStudent(student.id)}
                    className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Icons.Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Split Modal */}
      {showSplitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">Bulk PDF Splitter</h3>
              <button onClick={() => setShowSplitModal(false)} className="text-gray-400 hover:text-gray-600">
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              {splitStage === 'UPLOAD' && (
                <div className="text-center space-y-4">
                  <div className="p-4 bg-indigo-50 rounded-full inline-flex text-indigo-600 mb-2">
                    <Icons.Layers className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-semibold">Upload Class Packet</h4>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Upload a single PDF containing multiple students' work. I'll analyze page numbers and names to split it into individual files.
                  </p>
                  <div className="max-w-md mx-auto mt-6">
                    <FileUpload onFileSelect={startBulkSplit} label="Upload Bulk PDF" accept=".pdf" />
                  </div>
                </div>
              )}

              {splitStage === 'ANALYZING' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  <h4 className="text-lg font-medium text-gray-900">Scanning Document Structure...</h4>
                  <p className="text-gray-500">Identifying student names and page boundaries.</p>
                </div>
              )}

              {splitStage === 'CONFIRM' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-800">Detected Students ({detectedRanges.length})</h4>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                      Ready to split
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200 max-h-64 overflow-y-auto">
                    {detectedRanges.map((range, idx) => (
                      <div key={idx} className="p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                           <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
                             {idx + 1}
                           </div>
                           <input 
                             type="text" 
                             value={range.studentName}
                             onChange={(e) => {
                               const newRanges = [...detectedRanges];
                               newRanges[idx].studentName = e.target.value;
                               setDetectedRanges(newRanges);
                             }}
                             className="border-gray-300 rounded text-sm font-medium text-gray-900 focus:ring-indigo-500 focus:border-indigo-500"
                           />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>Pg</span>
                          <input 
                            type="number"
                            value={range.startPage}
                            className="w-12 border-gray-300 rounded text-center text-xs"
                            onChange={(e) => {
                               const newRanges = [...detectedRanges];
                               newRanges[idx].startPage = parseInt(e.target.value);
                               setDetectedRanges(newRanges);
                            }}
                          />
                          <span>-</span>
                          <input 
                            type="number"
                            value={range.endPage}
                            className="w-12 border-gray-300 rounded text-center text-xs"
                            onChange={(e) => {
                               const newRanges = [...detectedRanges];
                               newRanges[idx].endPage = parseInt(e.target.value);
                               setDetectedRanges(newRanges);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 italic">
                    * Please review the names and page ranges before confirming.
                  </p>
                </div>
              )}

              {splitStage === 'PROCESSING' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                   <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
                   <h4 className="text-lg font-medium text-gray-900">Splitting PDF...</h4>
                   <p className="text-gray-500">Creating individual student files.</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              {splitStage === 'CONFIRM' && (
                <>
                  <Button variant="ghost" onClick={() => setSplitStage('UPLOAD')}>Cancel</Button>
                  <Button onClick={finalizeSplit}>Confirm & Split</Button>
                </>
              )}
              {splitStage === 'UPLOAD' && (
                 <Button variant="ghost" onClick={() => setShowSplitModal(false)}>Close</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};