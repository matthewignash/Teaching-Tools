import React, { useState, useEffect, useRef } from 'react';
import { Assessment, StudentSubmission, RubricItem, QuestionGrade } from '../types';
import { Button } from '../components/Button';
import { Icons } from '../components/Icon';
import { gradeStudentSubmission } from '../services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

interface GradingViewProps {
  assessment: Assessment;
  onUpdate: (assessment: Assessment) => void;
  onBack: () => void;
}

export const GradingView: React.FC<GradingViewProps> = ({ assessment, onUpdate, onBack }) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAutoGrading, setIsAutoGrading] = useState(false);
  const [pdfPages, setPdfPages] = useState<any[]>([]); // Store decoded PDF pages
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  
  const selectedStudent = assessment.students.find(s => s.id === selectedStudentId);

  // Auto select first student if none selected
  useEffect(() => {
    if (!selectedStudentId && assessment.students.length > 0) {
      setSelectedStudentId(assessment.students[0].id);
    }
  }, [assessment.students, selectedStudentId]);

  // Load PDF using PDF.js when selected student changes
  useEffect(() => {
    const loadPdf = async () => {
      if (!selectedStudent || !selectedStudent.fileData || selectedStudent.fileType.startsWith('image')) {
        setPdfPages([]);
        return;
      }

      setIsPdfLoading(true);
      try {
        // Decode Base64 to binary
        const pdfData = atob(selectedStudent.fileData);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          pages.push(page);
        }
        setPdfPages(pages);
      } catch (error) {
        console.error("Error loading PDF:", error);
      } finally {
        setIsPdfLoading(false);
      }
    };

    loadPdf();
  }, [selectedStudent]);

  // Render pages to canvases
  useEffect(() => {
    if (pdfPages.length === 0) return;

    pdfPages.forEach((page, index) => {
      const canvas = canvasRefs.current[index];
      if (canvas) {
        const viewport = page.getViewport({ scale: 1.5 }); // Scale for better quality
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: canvas.getContext('2d')!,
          viewport: viewport,
        };
        page.render(renderContext);
      }
    });
  }, [pdfPages]);

  const handleGradeChange = (questionId: string, gradeData: Partial<QuestionGrade>) => {
    if (!selectedStudent) return;

    const rubricItem = assessment.rubric.find(r => r.id === questionId);
    let newGradeData = { ...gradeData };

    // Auto-recalculate score if studentAnswer is manually changed for MCQ
    if (rubricItem?.type === 'MCQ' && 'studentAnswer' in gradeData && rubricItem.correctAnswer) {
        const newVal = gradeData.studentAnswer?.trim().toUpperCase() || '';
        const correct = rubricItem.correctAnswer.trim().toUpperCase();
        // If the answer matches the key, give full points, otherwise 0
        newGradeData.score = newVal === correct ? rubricItem.maxPoints : 0;
        newGradeData.studentAnswer = newVal; 
    }

    const currentGrade = selectedStudent.grades[questionId] || { score: 0, comment: '' };
    const newGrades = {
      ...selectedStudent.grades,
      [questionId]: { ...currentGrade, ...newGradeData }
    };

    // Recalculate total
    const total = Object.values(newGrades).reduce((sum, g) => sum + g.score, 0);

    const updatedStudent: StudentSubmission = {
      ...selectedStudent,
      grades: newGrades,
      totalScore: total,
      status: 'GRADED' // Mark as graded once touched
    };

    const updatedStudents = assessment.students.map(s => 
      s.id === selectedStudentId ? updatedStudent : s
    );

    onUpdate({ ...assessment, students: updatedStudents });
  };

  const handleKeyChange = (questionId: string, newKey: string) => {
    // 1. Update the Rubric
    const updatedRubric = assessment.rubric.map(r => 
      r.id === questionId ? { ...r, correctAnswer: newKey.toUpperCase() } : r
    );

    // 2. Re-grade the current student for this specific question immediately
    let updatedStudents = assessment.students;
    
    if (selectedStudent) {
      const rubricItem = updatedRubric.find(r => r.id === questionId);
      const currentGrade = selectedStudent.grades[questionId];
      
      // Only re-grade if we have a student answer to compare against
      if (rubricItem && currentGrade?.studentAnswer) {
         const isCorrect = currentGrade.studentAnswer.trim().toUpperCase() === newKey.trim().toUpperCase();
         const newScore = isCorrect ? rubricItem.maxPoints : 0;
         
         const newGrades = {
           ...selectedStudent.grades,
           [questionId]: { ...currentGrade, score: newScore }
         };
         
         const newTotal = Object.values(newGrades).reduce((sum, g) => sum + g.score, 0);
         
         const updatedStudent = {
            ...selectedStudent,
            grades: newGrades,
            totalScore: newTotal
         };

         updatedStudents = assessment.students.map(s => 
           s.id === selectedStudent.id ? updatedStudent : s
         );
      }
    }

    onUpdate({ ...assessment, rubric: updatedRubric, students: updatedStudents });
  };

  const runAiGrading = async () => {
    if (!selectedStudent || !selectedStudent.fileData) return;

    setIsAutoGrading(true);
    try {
      const results = await gradeStudentSubmission(
        assessment.rubric, 
        selectedStudent.fileData,
        selectedStudent.fileType
      );

      const newGrades = { ...selectedStudent.grades };
      let newTotal = 0;

      results.forEach(res => {
        // If it's MCQ, ensure strict scoring if possible
        const rubricItem = assessment.rubric.find(r => r.id === res.questionId);
        let finalScore = res.score;
        
        if (rubricItem?.type === 'MCQ' && rubricItem.correctAnswer && res.studentAnswer) {
             const isCorrect = rubricItem.correctAnswer.trim().toUpperCase() === res.studentAnswer.trim().toUpperCase();
             finalScore = isCorrect ? rubricItem.maxPoints : 0;
        }

        newGrades[res.questionId] = {
          score: finalScore,
          comment: res.comment,
          studentAnswer: res.studentAnswer,
          isAiSuggested: true
        };
        newTotal += finalScore;
      });

      const updatedStudent: StudentSubmission = {
        ...selectedStudent,
        grades: newGrades,
        totalScore: newTotal,
        status: 'GRADED'
      };

      const updatedStudents = assessment.students.map(s => 
        s.id === selectedStudentId ? updatedStudent : s
      );

      onUpdate({ ...assessment, students: updatedStudents });

    } catch (err) {
      console.error(err);
      alert("AI Grading failed. Please check your API key.");
    } finally {
      setIsAutoGrading(false);
    }
  };

  const addCannedComment = (text: string) => {
    if (!assessment.cannedComments.includes(text)) {
      onUpdate({
        ...assessment,
        cannedComments: [...assessment.cannedComments, text]
      });
    }
  };

  if (assessment.students.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-bold text-gray-800">No students to grade</h3>
        <Button onClick={onBack} variant="secondary" className="mt-4">Go Back to Add Students</Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row gap-6">
      {/* Student List Sidebar */}
      <div className="w-full md:w-64 flex-shrink-0 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-700">Students ({assessment.students.length})</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {assessment.students.map(student => (
            <button
              key={student.id}
              onClick={() => setSelectedStudentId(student.id)}
              className={`w-full text-left p-3 border-b border-gray-100 transition-colors flex justify-between items-center
                ${selectedStudentId === student.id ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-gray-50'}
              `}
            >
              <div>
                <p className={`font-medium ${selectedStudentId === student.id ? 'text-indigo-900' : 'text-gray-900'}`}>
                  {student.studentName}
                </p>
                <span className="text-xs text-gray-500">
                  Total: {student.totalScore} pts
                </span>
              </div>
              {student.status === 'GRADED' && (
                <Icons.CheckCircle className="w-4 h-4 text-green-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
        {selectedStudent ? (
          <>
            {/* Left: Document Viewer */}
            <div className="hidden md:flex flex-1 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 flex-col relative group">
              <div className="bg-white p-2 border-b flex justify-between items-center px-4">
                <span className="font-medium text-gray-600 truncate">{selectedStudent.fileName}</span>
              </div>
              <div className="flex-1 relative overflow-auto bg-gray-500/10 flex justify-center p-4">
                {/* PDF/Image Preview */}
                {selectedStudent.fileType.startsWith('image') ? (
                  <img 
                    src={`data:${selectedStudent.fileType};base64,${selectedStudent.fileData}`} 
                    alt="Student work" 
                    className="max-w-full shadow-lg"
                  />
                ) : (
                  <div className="flex flex-col gap-4 items-center w-full">
                    {isPdfLoading && (
                      <div className="flex items-center gap-2 text-gray-500 mt-10">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                        Rendering PDF...
                      </div>
                    )}
                    {pdfPages.map((_, index) => (
                      <canvas
                        key={index}
                        ref={(el) => { canvasRefs.current[index] = el; }}
                        className="shadow-lg max-w-full bg-white rounded-sm"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Grading Panel */}
            <div className="w-full md:w-[450px] bg-white rounded-xl border border-gray-200 flex flex-col shadow-sm">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                <div>
                  <h2 className="font-bold text-lg text-gray-800">{selectedStudent.studentName}</h2>
                  <p className="text-sm text-gray-500">
                    Current Score: <span className="font-bold text-indigo-600">{selectedStudent.totalScore}</span>
                  </p>
                </div>
                <Button 
                  onClick={runAiGrading} 
                  disabled={isAutoGrading || !selectedStudent.fileData}
                  size="sm"
                  className="gap-2 shadow-sm"
                >
                  {isAutoGrading ? 'Grading...' : <><Icons.Brain className="w-4 h-4" /> Auto-Grade</>}
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {assessment.rubric.map((item) => {
                  const grade = selectedStudent.grades[item.id] || { score: 0, comment: '', studentAnswer: '' };
                  const isMCQ = item.type === 'MCQ';
                  const isCorrect = isMCQ && item.correctAnswer && grade.studentAnswer 
                     ? grade.studentAnswer.trim().toUpperCase() === item.correctAnswer.trim().toUpperCase()
                     : false;
                  
                  return (
                    <div key={item.id} className={`border rounded-lg p-4 transition-all 
                      ${isMCQ && grade.studentAnswer ? (isCorrect ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30') : 'border-gray-200'}
                    `}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 mr-2">
                          <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                            {item.question} 
                            {isMCQ && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">MCQ</span>}
                          </span>
                          
                          {/* MCQ Specific Display */}
                          {isMCQ ? (
                            <div className="mt-2 flex items-center gap-3 text-sm">
                               <div className="flex flex-col items-center">
                                 <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">Key</span>
                                 <input 
                                   type="text"
                                   maxLength={1}
                                   value={item.correctAnswer || ''}
                                   onChange={(e) => handleKeyChange(item.id, e.target.value)}
                                   className="w-8 h-8 text-center font-bold rounded border border-indigo-200 bg-indigo-50 text-indigo-700 uppercase focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                                 />
                               </div>
                               <div className="text-gray-300 mt-4"><Icons.ChevronRight className="w-4 h-4"/></div>
                               <div className="flex flex-col items-center">
                                 <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">Student</span>
                                 <input 
                                   type="text"
                                   maxLength={1}
                                   value={grade.studentAnswer || ''}
                                   onChange={(e) => handleGradeChange(item.id, { studentAnswer: e.target.value })}
                                   className={`w-8 h-8 text-center font-bold rounded border uppercase focus:ring-2 focus:ring-offset-1 focus:outline-none transition-colors
                                     ${grade.studentAnswer 
                                       ? (isCorrect 
                                          ? 'bg-green-100 text-green-700 border-green-300 focus:ring-green-500' 
                                          : 'bg-red-100 text-red-700 border-red-300 focus:ring-red-500') 
                                       : 'bg-white text-gray-600 border-gray-300 focus:ring-indigo-500'}
                                   `}
                                 />
                               </div>
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-gray-900 mt-1">{item.criteria}</p>
                            </>
                          )}

                        </div>
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1">
                             <input
                              type="number"
                              min="0"
                              max={item.maxPoints}
                              value={grade.score}
                              onChange={(e) => handleGradeChange(item.id, { score: parseFloat(e.target.value) || 0 })}
                              className={`w-14 p-1 text-right border rounded font-bold focus:ring-2 focus:ring-offset-1 
                                ${isMCQ && grade.studentAnswer ? (isCorrect ? 'border-green-300 text-green-700 focus:ring-green-500' : 'border-red-300 text-red-700 focus:ring-red-500') : 'border-gray-300 text-indigo-600 focus:ring-indigo-500'}
                              `}
                            />
                            <span className="text-sm text-gray-400">/ {item.maxPoints}</span>
                          </div>
                        </div>
                      </div>
                      
                      {!isMCQ && (
                        <div className="mt-3">
                          <textarea
                            placeholder="Feedback comment..."
                            value={grade.comment}
                            onChange={(e) => handleGradeChange(item.id, { comment: e.target.value })}
                            rows={2}
                            className="w-full text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                             {/* Quick add canned comment suggestion if empty */}
                             {grade.comment === '' && assessment.cannedComments.slice(0, 3).map((cc, idx) => (
                               <button 
                                 key={idx}
                                 onClick={() => handleGradeChange(item.id, { comment: cc })}
                                 className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 truncate max-w-[200px]"
                               >
                                 {cc}
                               </button>
                             ))}
                             {grade.comment && !assessment.cannedComments.includes(grade.comment) && (
                               <button
                                 onClick={() => addCannedComment(grade.comment)}
                                 className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                               >
                                 <Icons.Plus className="w-3 h-3" /> Save as Canned
                               </button>
                             )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a student to begin grading
          </div>
        )}
      </div>
    </div>
  );
};