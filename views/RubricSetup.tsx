import React, { useState } from 'react';
import { Assessment, RubricItem } from '../types';
import { Button } from '../components/Button';
import { FileUpload } from '../components/FileUpload';
import { Icons } from '../components/Icon';
import { generateRubricFromPDF } from '../services/geminiService';

interface RubricSetupProps {
  assessment: Assessment;
  onUpdate: (assessment: Assessment) => void;
  onNext: () => void;
}

export const RubricSetup: React.FC<RubricSetupProps> = ({ assessment, onUpdate, onNext }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64String = (reader.result as string).split(',')[1];
          const rubric = await generateRubricFromPDF(base64String, file.type);
          onUpdate({ ...assessment, rubric });
        } catch (err) {
          setError("Failed to generate rubric from file. Please try again or create manually.");
        } finally {
          setIsGenerating(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Error reading file.");
      setIsGenerating(false);
    }
  };

  const addQuestion = () => {
    const newQ: RubricItem = {
      id: `q-${Date.now()}`,
      question: "New Question",
      maxPoints: 1,
      criteria: "Criteria description",
      type: 'FRQ'
    };
    onUpdate({ ...assessment, rubric: [...assessment.rubric, newQ] });
  };

  const updateQuestion = (id: string, field: keyof RubricItem, value: any) => {
    const updated = assessment.rubric.map(q => 
      q.id === id ? { ...q, [field]: value } : q
    );
    onUpdate({ ...assessment, rubric: updated });
  };

  const removeQuestion = (id: string) => {
    onUpdate({ ...assessment, rubric: assessment.rubric.filter(q => q.id !== id) });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Step 1: Create Rubric</h2>
          <p className="text-gray-500">Define grading key. Upload an answer key for auto-detection.</p>
        </div>
        <div className="flex gap-3">
           {assessment.rubric.length > 0 && (
             <Button onClick={onNext} className="gap-2">
               Next: Add Students <Icons.ChevronRight className="w-4 h-4" />
             </Button>
           )}
        </div>
      </div>

      {/* AI Generator Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-lg shadow-sm text-indigo-600">
            <Icons.Brain className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">AI Answer Key Import</h3>
            <p className="text-gray-600 mb-4">Upload a PDF answer key (e.g., "1. A, 2. B..."). I will auto-detect MCQs and criteria.</p>
            
            {isGenerating ? (
              <div className="flex items-center gap-3 text-indigo-700 bg-white/50 p-4 rounded-lg">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-700"></div>
                Analyzing answer key...
              </div>
            ) : (
              <div className="max-w-md">
                 <FileUpload onFileSelect={handleFileUpload} label="Upload Answer Key PDF" compact />
              </div>
            )}
            {error && (
              <div className="mt-3 text-sm text-red-600 flex items-center gap-2">
                <Icons.AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Editor */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Rubric Items ({assessment.rubric.length})</h3>
          <Button variant="secondary" onClick={addQuestion} size="sm" className="gap-2">
            <Icons.Plus className="w-4 h-4" /> Add Question
          </Button>
        </div>

        {assessment.rubric.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500">No questions yet. Upload a key or add manually.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {assessment.rubric.map((item, idx) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative">
                <div className="flex justify-between items-start gap-6">
                  {/* Left: Metadata */}
                  <div className="w-1/4 space-y-3">
                     <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Type</label>
                        <select 
                          value={item.type || 'FRQ'} 
                          onChange={(e) => updateQuestion(item.id, 'type', e.target.value)}
                          className="w-full border-gray-300 rounded-md text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        >
                          <option value="FRQ">Free Response</option>
                          <option value="MCQ">Multiple Choice</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Points</label>
                        <input 
                          type="number" 
                          value={item.maxPoints}
                          onChange={(e) => updateQuestion(item.id, 'maxPoints', Number(e.target.value))}
                          className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      {item.type === 'MCQ' && (
                        <div>
                           <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">Correct Answer</label>
                           <input 
                             type="text" 
                             placeholder="A, B, C..."
                             value={item.correctAnswer || ''}
                             onChange={(e) => updateQuestion(item.id, 'correctAnswer', e.target.value.toUpperCase())}
                             className="w-full border-indigo-300 bg-indigo-50 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-bold text-center"
                           />
                        </div>
                      )}
                  </div>

                  {/* Right: Content */}
                  <div className="flex-1 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Question / Prompt</label>
                        <input 
                          type="text" 
                          value={item.question}
                          onChange={(e) => updateQuestion(item.id, 'question', e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                        {item.type === 'MCQ' ? 'Criteria / Notes' : 'Success Criteria'}
                      </label>
                      <textarea 
                        value={item.criteria}
                        onChange={(e) => updateQuestion(item.id, 'criteria', e.target.value)}
                        rows={2}
                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Delete Action */}
                  <button 
                    onClick={() => removeQuestion(item.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <Icons.Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};