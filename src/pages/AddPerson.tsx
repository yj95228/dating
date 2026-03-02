import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

type Gender = "M" | "F";

const AddPerson = () => {
    const [name, setName] = useState("");
    const [gender, setGender] = useState<Gender | "">("");
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const uploadToCloudinary = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "people_photos");

        const res = await fetch(
            "https://api.cloudinary.com/v1_1/dw5pudchc/image/upload",
            { method: "POST", body: formData }
        );
        const data = await res.json();
        return data.secure_url;
    };

    const handleAdd = async () => {
        if (!gender) {
            alert("성별을 선택해주세요");
            return;
        }

        setLoading(true);
        try {
            let photoUrls: string[] = [];
            for (const file of files) {
                const url = await uploadToCloudinary(file);
                photoUrls.push(url);
            }

            await addDoc(collection(db, "people"), {
                name: name || null,
                gender,
                photoUrls, // 배열로 저장
                createdAt: serverTimestamp(),
            });

            setName("");
            setGender("");
            setFiles([]);
            setPreviews([]);
            alert("사람 추가 완료!");
        } catch (err) {
            console.error(err);
            alert("저장 중 오류 발생");
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            setFiles(selectedFiles);
            setPreviews(selectedFiles.map(f => URL.createObjectURL(f)));
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="max-w-md mx-auto p-4 space-y-4">
            <h1 className="text-2xl font-bold text-center mb-2">사람 추가</h1>

            <input
                type="text"
                placeholder="이름 (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border p-3 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />

            <div className="flex gap-4">
                <button
                    className={`flex-1 p-2 rounded font-medium ${gender === "M" ? "bg-blue-500 text-white shadow" : "border"
                        }`}
                    onClick={() => setGender("M")}
                >
                    남
                </button>
                <button
                    className={`flex-1 p-2 rounded font-medium ${gender === "F" ? "bg-pink-500 text-white shadow" : "border"
                        }`}
                    onClick={() => setGender("F")}
                >
                    여
                </button>
            </div>

            <div className="space-y-2">
                <label className="block font-medium">사진 선택</label>

                <input
                    type="file"
                    id="fileInput"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                />

                <label
                    htmlFor="fileInput"
                    className="w-full text-center p-2 border rounded bg-gray-100 cursor-pointer hover:bg-gray-200"
                >
                    {files.length > 0 ? `파일 ${files.length}개 선택됨` : "파일 선택"}
                </label>

                <div className="flex gap-2 flex-wrap">
                    {previews.map((src, idx) => (
                        <div key={idx} className="relative w-24 h-24">
                            <img
                                src={src}
                                alt="preview"
                                className="w-full h-full object-cover rounded shadow"
                            />
                            <button
                                onClick={() => removeFile(idx)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <button
                onClick={handleAdd}
                disabled={loading}
                className="w-full bg-blue-500 text-white p-3 rounded shadow hover:bg-blue-600"
            >
                {loading ? "저장 중..." : "사람 추가"}
            </button>

            <Link
                to="/"
                className="block text-center text-blue-500 mt-2 underline"
            >
                목록 페이지로 이동
            </Link>
        </div >
    );
};

export default AddPerson;
