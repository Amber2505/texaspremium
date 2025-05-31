// "use client";
// import { useState, ChangeEvent, MouseEvent } from "react";

// interface FormData {
//   state: string;
//   idType: string;
//   licenseplateno: string;
//   vehicleInputType: string;
//   coverage: string;
//   effectiveDate?: string;
//   phone?: string;
//   email?: string;
// }

// interface Vehicle {
//   vin: string;
//   year: string;
//   make: string;
//   model: string;
//   name?: string;
//   trim?: string;
//   style?: string;
//   engine?: string;
//   transmission?: string;
//   driveType?: string;
//   fuel?: string;
//   image_url?: string;
// }

// interface Driver {
//   licenseId?: string;
//   idType: string;
//   F_name?: string;
//   L_name?: string;
//   DOB?: string;
//   Address?: string;
//   phone?: string;
//   email?: string;
//   state?: string; // For out-of-state license state
//   country?: string; // For international ID country
//   generalStatus?: string; // e.g., student, employed, retired
//   maritalStatus?: string; // e.g., single, married, divorced
//   relationship?: string; // e.g., spouse, relative, other, parent
// }

// export default function Home() {
//   const [step, setStep] = useState<number>(1);
//   const [formData, setFormData] = useState<FormData>({
//     state: "",
//     idType: "",
//     licenseplateno: "",
//     vehicleInputType: "",
//     coverage: "",
//   });
//   const [drivers, setDrivers] = useState<Driver[]>([]);
//   const [currentDriver, setCurrentDriver] = useState<Driver>({
//     idType: "",
//     licenseId: "",
//     relationship: "Principle / Primary Operator", // Default for primary driver
//   });
//   const [vehicles, setVehicles] = useState<Vehicle[]>([]);
//   const [currentVin, setCurrentVin] = useState<string>("");
//   const [currentLicensePlate, setCurrentLicensePlate] = useState<string>("");
//   const [editingAddress, setEditingAddress] = useState<number | null>(null);
//   const [vinError, setVinError] = useState<string>("");
//   const [driverError, setDriverError] = useState<string>("");
//   const [lpError, setLpError] = useState<string>("");
//   const [showAddAnotherDriverPrompt, setShowAddAnotherDriverPrompt] =
//     useState<boolean>(false);

//   const handleNext = (e: MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();
//     if (step < 4) {
//       if (step === 1) {
//         if (drivers.length === 0) {
//           alert("Please add at least one driver before proceeding.");
//           return;
//         }
//         const primaryDriver = drivers[0];
//         if (!primaryDriver.email || !primaryDriver.phone) {
//           alert(
//             "Please provide an email and phone number for the primary driver."
//           );
//           return;
//         }
//         if (!primaryDriver.Address) {
//           alert("Please provide an address for the primary driver.");
//           return;
//         }
//         if (!primaryDriver.generalStatus || !primaryDriver.maritalStatus) {
//           alert(
//             "Please provide general status and marital status for the primary driver."
//           );
//           return;
//         }
//       }
//       if (step === 2 && vehicles.length === 0) {
//         alert("Please add at least one vehicle before proceeding.");
//         return;
//       }
//       setStep(step + 1);
//     }
//   };

//   const handleSearch = async (e: MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();
//     const {
//       licenseId,
//       idType,
//       F_name,
//       L_name,
//       DOB,
//       Address,
//       phone,
//       email,
//       state,
//       country,
//       generalStatus,
//       maritalStatus,
//       relationship,
//     } = currentDriver;

//     if (idType === "in-state") {
//       if (
//         licenseId &&
//         drivers.some((driver) => driver.licenseId === licenseId)
//       ) {
//         setDriverError("This Driver's License number is already added.");
//         return;
//       }

//       if (licenseId && licenseId.length === 8) {
//         try {
//           const response = await fetch(
//             `https://astraldbapi.herokuapp.com/get_basic_dl_info/${licenseId}`
//           );

//           if (!response.ok) {
//             throw new Error("Invalid response from server");
//           }

//           const data = await response.json();

//           if (data && data.Full_name) {
//             const newDriver = {
//               ...currentDriver,
//               F_name: data.F_name,
//               L_name: data.L_name,
//               DOB: data.DOB,
//               Address: data.Address,
//               phone: phone || "",
//               relationship:
//                 drivers.length === 0
//                   ? "Principle / Primary Operator"
//                   : relationship,
//             };
//             setDrivers([...drivers, newDriver]);
//             setCurrentDriver({
//               idType: "",
//               licenseId: "",
//               relationship: "Principle / Primary Operator",
//             });
//             setDriverError("");
//             setShowAddAnotherDriverPrompt(true);
//             console.log("Driver added:", newDriver);
//           } else {
//             setDriverError(
//               "License number not found. Please check and try again."
//             );
//           }
//         } catch (error) {
//           console.error("API Error:", error);
//           setDriverError(
//             "An error occurred while validating the license number."
//           );
//         }
//       } else {
//         setDriverError("Please enter a valid 8-digit license number.");
//       }
//     } else {
//       if (!F_name || !L_name || !DOB || !Address || !phone) {
//         setDriverError(
//           "Please fill in all required fields (First Name, Last Name, DOB, Address, Phone)."
//         );
//         return;
//       }
//       if (drivers.length === 0 && !email) {
//         setDriverError("Email is required for the primary driver.");
//         return;
//       }
//       if (drivers.length === 0 && (!generalStatus || !maritalStatus)) {
//         setDriverError(
//           "General status and marital status are required for the primary driver."
//         );
//         return;
//       }
//       const newDriver = {
//         ...currentDriver,
//         phone,
//         email: drivers.length === 0 ? email : undefined,
//         state: idType === "out-of-state" ? state : undefined,
//         country: idType === "international" ? country : undefined,
//         generalStatus,
//         maritalStatus,
//         relationship:
//           drivers.length === 0 ? "Principle / Primary Operator" : relationship,
//       };
//       setDrivers([...drivers, newDriver]);
//       setCurrentDriver({
//         idType: "",
//         licenseId: "",
//         relationship: "Principle / Primary Operator",
//       });
//       setDriverError("");
//       setShowAddAnotherDriverPrompt(true);
//     }
//   };

//   const handleVinSearch = async (e: MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();

//     if (!currentVin || currentVin.length < 17) {
//       setVinError("Please enter a valid VIN No.");
//       return;
//     }

//     if (vehicles.some((vehicle) => vehicle.vin === currentVin)) {
//       setVinError("This VIN has already been added.");
//       return;
//     }

//     try {
//       const response = await fetch(
//         `https://astraldbapi.herokuapp.com/basic_vin_data/${currentVin}`
//       );

//       if (!response.ok) {
//         throw new Error("Invalid VIN or response");
//       }

//       const data = await response.json();

//       if (data && data.vin) {
//         setVehicles([...vehicles, data]);
//         setCurrentVin("");
//         setVinError("");
//         console.log("VIN Data:", data);
//       } else {
//         setVinError("No vehicle info found for that VIN.");
//       }
//     } catch (err) {
//       console.error("VIN API Error:", err);
//       setVinError("Something went wrong while searching VIN.");
//     }
//   };

//   const handleLicensePlateSearch = async (e: MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();

//     if (!formData.licenseplateno || !formData.state) {
//       setLpError("Please enter a license plate number and select a state.");
//       return;
//     }

//     try {
//       const response = await fetch(
//         `https://astraldbapi.herokuapp.com/basic_lp_data/?lp_data=${formData.licenseplateno}&state=${formData.state}`
//       );

//       if (!response.ok) {
//         throw new Error("Invalid license plate or response");
//       }

//       const data = await response.json();

//       if (data && data.vin) {
//         if (vehicles.some((vehicle) => vehicle.vin === data.vin)) {
//           setLpError("This vehicle (VIN) has already been added.");
//           return;
//         }
//         setVehicles([...vehicles, data]);
//         setCurrentLicensePlate("");
//         setFormData({ ...formData, licenseplateno: "" });
//         setLpError("");
//         console.log("License Plate Data:", data);
//       } else {
//         setLpError("No vehicle info found for that license plate.");
//       }
//     } catch (err) {
//       console.error("License Plate API Error:", err);
//       setLpError("Something went wrong while searching the license plate.");
//     }
//   };

//   const handleRemoveDriver = (index: number) => {
//     setDrivers(drivers.filter((_, i) => i !== index));
//     setDriverError("");
//   };

//   const handleRemoveVehicle = (vin: string) => {
//     setVehicles(vehicles.filter((vehicle) => vehicle.vin !== vin));
//     setVinError("");
//     setLpError("");
//   };

//   const handleBack = (e: MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();
//     if (step > 1) setStep(step - 1);
//   };

//   const handleChange = (
//     e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
//   ) => {
//     setFormData({ ...formData, [e.target.name]: e.target.value });
//   };

//   const handleDriverChange = (
//     e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
//   ) => {
//     setCurrentDriver({ ...currentDriver, [e.target.name]: e.target.value });
//   };

//   const renderStep = () => {
//     switch (step) {
//       case 1:
//         return (
//           <div className="space-y-4">
//             <h2 className="text-lg font-semibold">Driver Info</h2>
//             <div className="flex justify-center">
//               <div className="text-center">
//                 <label className="block text-sm mb-1">Effective Date</label>
//                 <input
//                   type="date"
//                   name="effectiveDate"
//                   min={new Date().toISOString().split("T")[0]}
//                   value={formData.effectiveDate || ""}
//                   onChange={handleChange}
//                   onKeyDown={(e) => e.preventDefault()}
//                   className="border p-1 text-sm w-40 rounded text-center"
//                 />
//               </div>
//             </div>
//             {showAddAnotherDriverPrompt &&
//             drivers.length > 0 &&
//             !currentDriver.idType ? (
//               <div className="text-center space-y-2">
//                 <p className="text-sm font-medium">
//                   Would you like to add another driver?
//                 </p>
//                 <div className="flex justify-center gap-3">
//                   <button
//                     onClick={() => {
//                       setCurrentDriver({
//                         idType: "",
//                         licenseId: "",
//                         relationship: "Principle / Primary Operator",
//                       });
//                       setShowAddAnotherDriverPrompt(false);
//                     }}
//                     className="bg-blue-500 text-white px-4 py-2 rounded text-sm"
//                   >
//                     Yes, Add Another Driver
//                   </button>
//                 </div>
//               </div>
//             ) : (
//               <>
//                 <div>
//                   <label className="block mb-2">
//                     {drivers.length > 0
//                       ? "What kind of ID does the other driver have?"
//                       : "ID Type:"}
//                   </label>
//                   <div className="flex justify-center">
//                     <div className="flex flex-row flex-wrap gap-3 justify-center">
//                       <div
//                         onClick={() =>
//                           setCurrentDriver({
//                             ...currentDriver,
//                             idType: "in-state",
//                           })
//                         }
//                         className={`p-3 w-64 border rounded-lg cursor-pointer text-center text-sm ${
//                           currentDriver.idType === "in-state"
//                             ? "bg-blue-100 border-blue-500"
//                             : "border-gray-300"
//                         }`}
//                       >
//                         In-state (TX) Driver's License or State ID
//                       </div>
//                       <div
//                         onClick={() =>
//                           setCurrentDriver({
//                             ...currentDriver,
//                             idType: "out-of-state",
//                           })
//                         }
//                         className={`p-3 w-64 border rounded-lg cursor-pointer text-center text-sm ${
//                           currentDriver.idType === "out-of-state"
//                             ? "bg-blue-100 border-blue-500"
//                             : "border-gray-300"
//                         }`}
//                       >
//                         Out-of-State Driver's License or State ID
//                       </div>
//                       <div
//                         onClick={() =>
//                           setCurrentDriver({
//                             ...currentDriver,
//                             idType: "international",
//                           })
//                         }
//                         className={`p-3 w-64 border rounded-lg cursor-pointer text-center text-sm ${
//                           currentDriver.idType === "international"
//                             ? "bg-blue-100 border-blue-500"
//                             : "border-gray-300"
//                         }`}
//                       >
//                         International / Foreign ID / Passport
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//                 {currentDriver.idType && (
//                   <div className="space-y-4">
//                     <div>
//                       <label className="block mb-1">
//                         {currentDriver.idType === "in-state"
//                           ? "Driver's License / State ID Number"
//                           : currentDriver.idType === "out-of-state"
//                           ? "Out-of-State Driver's License / State ID Number"
//                           : "International / Foreign ID / Passport Number"}
//                       </label>
//                       <div className="flex gap-2">
//                         <input
//                           type="text"
//                           placeholder={`Enter your ${
//                             currentDriver.idType === "in-state"
//                               ? "TX Driver's License or ID number"
//                               : currentDriver.idType === "out-of-state"
//                               ? "Out-of-State Driver's License or ID number"
//                               : "International ID or Passport number"
//                           }`}
//                           pattern={
//                             currentDriver.idType === "in-state"
//                               ? "\\d{8}"
//                               : undefined
//                           }
//                           inputMode={
//                             currentDriver.idType === "in-state"
//                               ? "numeric"
//                               : "text"
//                           }
//                           maxLength={
//                             currentDriver.idType === "in-state" ? 8 : undefined
//                           }
//                           onChange={(e) => {
//                             const value = e.target.value;
//                             if (
//                               currentDriver.idType === "in-state" &&
//                               !/^\d{0,8}$/.test(value)
//                             ) {
//                               return;
//                             }
//                             setCurrentDriver({
//                               ...currentDriver,
//                               licenseId: value,
//                             });
//                           }}
//                           value={currentDriver.licenseId || ""}
//                           className="border p-2 w-full rounded"
//                         />
//                         <button
//                           onClick={handleSearch}
//                           className="bg-blue-500 text-white px-4 py-2 rounded"
//                         >
//                           Add Driver
//                         </button>
//                       </div>
//                       {driverError && (
//                         <p className="text-red-500 text-sm mt-2">
//                           {driverError}
//                         </p>
//                       )}
//                     </div>
//                     <div className="space-y-4">
//                       <div className="flex gap-4">
//                         <div className="w-1/2">
//                           <label className="block mb-1">First Name</label>
//                           <input
//                             type="text"
//                             value={currentDriver.F_name || ""}
//                             onChange={handleDriverChange}
//                             name="F_name"
//                             className="border p-2 w-full rounded"
//                             placeholder="Enter First Name"
//                           />
//                         </div>
//                         <div className="w-1/2">
//                           <label className="block mb-1">Last Name</label>
//                           <input
//                             type="text"
//                             value={currentDriver.L_name || ""}
//                             onChange={handleDriverChange}
//                             name="L_name"
//                             className="border p-2 w-full rounded"
//                             placeholder="Enter Last Name"
//                           />
//                         </div>
//                       </div>
//                       <div className="flex gap-4">
//                         <div className="w-1/2">
//                           <label className="block mb-1">Date of Birth</label>
//                           <input
//                             type="date"
//                             value={currentDriver.DOB || ""}
//                             onChange={handleDriverChange}
//                             name="DOB"
//                             className="border p-2 w-full rounded"
//                           />
//                         </div>
//                         <div className="w-1/2">
//                           <label className="block mb-1">Address</label>
//                           <input
//                             type="text"
//                             value={currentDriver.Address || ""}
//                             onChange={handleDriverChange}
//                             name="Address"
//                             className="border p-2 w-full rounded"
//                             placeholder="Enter Address"
//                           />
//                         </div>
//                       </div>
//                       <div className="flex gap-4">
//                         <div className="w-1/2">
//                           <label className="block mb-1">Phone Number</label>
//                           <input
//                             type="tel"
//                             pattern="\d{10}"
//                             inputMode="numeric"
//                             maxLength={10}
//                             value={currentDriver.phone || ""}
//                             onChange={handleDriverChange}
//                             name="phone"
//                             placeholder="Enter 10-digit phone number"
//                             className="border p-2 w-full rounded"
//                           />
//                         </div>
//                         {drivers.length === 0 && (
//                           <div className="w-1/2">
//                             <label className="block mb-1">Email Address</label>
//                             <input
//                               type="email"
//                               value={currentDriver.email || ""}
//                               onChange={handleDriverChange}
//                               name="email"
//                               placeholder="Enter email"
//                               className="border p-2 w-full rounded"
//                             />
//                           </div>
//                         )}
//                         {currentDriver.idType === "out-of-state" && (
//                           <div className="w-1/2">
//                             <label className="block mb-1">State</label>
//                             <select
//                               name="state"
//                               value={currentDriver.state || ""}
//                               onChange={handleDriverChange}
//                               className="border p-2 w-full rounded"
//                             >
//                               <option value="">Select State</option>
//                               {[
//                                 "AL",
//                                 "AK",
//                                 "AZ",
//                                 "AR",
//                                 "CA",
//                                 "CO",
//                                 "CT",
//                                 "DE",
//                                 "FL",
//                                 "GA",
//                                 "HI",
//                                 "ID",
//                                 "IL",
//                                 "IN",
//                                 "IA",
//                                 "KS",
//                                 "KY",
//                                 "LA",
//                                 "ME",
//                                 "MD",
//                                 "MA",
//                                 "MI",
//                                 "MN",
//                                 "MS",
//                                 "MO",
//                                 "MT",
//                                 "NE",
//                                 "NV",
//                                 "NH",
//                                 "NJ",
//                                 "NM",
//                                 "NY",
//                                 "NC",
//                                 "ND",
//                                 "OH",
//                                 "OK",
//                                 "OR",
//                                 "PA",
//                                 "RI",
//                                 "SC",
//                                 "SD",
//                                 "TN",
//                                 "TX",
//                                 "UT",
//                                 "VT",
//                                 "VA",
//                                 "WA",
//                                 "WV",
//                                 "WI",
//                                 "WY",
//                               ].map((state) => (
//                                 <option key={state} value={state}>
//                                   {state}
//                                 </option>
//                               ))}
//                             </select>
//                           </div>
//                         )}
//                         {currentDriver.idType === "international" && (
//                           <div className="w-1/2">
//                             <label className="block mb-1">Country</label>
//                             <input
//                               type="text"
//                               value={currentDriver.country || ""}
//                               onChange={handleDriverChange}
//                               name="country"
//                               placeholder="Enter Country"
//                               className="border p-2 w-full rounded"
//                             />
//                           </div>
//                         )}
//                       </div>
//                       <div className="flex gap-4">
//                         <div className="w-1/2">
//                           <label className="block mb-1">General Status</label>
//                           <select
//                             name="generalStatus"
//                             value={currentDriver.generalStatus || ""}
//                             onChange={handleDriverChange}
//                             className="border p-2 w-full rounded"
//                           >
//                             <option value="">Select...</option>
//                             <option value="student">Student</option>
//                             <option value="employed">Employed</option>
//                             <option value="retired">Retired</option>
//                           </select>
//                         </div>
//                         <div className="w-1/2">
//                           <label className="block mb-1">Marital Status</label>
//                           <select
//                             name="maritalStatus"
//                             value={currentDriver.maritalStatus || ""}
//                             onChange={handleDriverChange}
//                             className="border p-2 w-full rounded"
//                           >
//                             <option value="">Select...</option>
//                             <option value="single">Single</option>
//                             <option value="married">Married</option>
//                             <option value="divorced">Divorced</option>
//                           </select>
//                         </div>
//                       </div>
//                       <div>
//                         <label className="block mb-1">
//                           Relationship to Primary Driver
//                         </label>
//                         {drivers.length === 0 ? (
//                           <input
//                             type="text"
//                             value={currentDriver.relationship || ""}
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         ) : (
//                           <select
//                             name="relationship"
//                             value={currentDriver.relationship || ""}
//                             onChange={handleDriverChange}
//                             className="border p-2 w-full rounded"
//                           >
//                             <option value="">Select...</option>
//                             <option value="spouse">Spouse</option>
//                             <option value="relative">Relative</option>
//                             <option value="other">Other</option>
//                             <option value="parent">Parent</option>
//                           </select>
//                         )}
//                       </div>
//                     </div>
//                   </div>
//                 )}
//               </>
//             )}
//             {drivers.length > 0 && (
//               <div className="mt-6 space-y-4">
//                 <h3 className="text-md font-semibold">Added Drivers</h3>
//                 {drivers.map((driver, index) => (
//                   <div
//                     key={index}
//                     className="p-4 bg-gray-50 rounded-lg border space-y-2"
//                   >
//                     <h4 className="font-semibold">
//                       Driver {index + 1} - {driver.idType.replace("-", " ")}
//                     </h4>
//                     <div className="flex gap-4">
//                       <div className="w-1/2">
//                         <label className="block text-sm font-medium">
//                           First Name
//                         </label>
//                         <input
//                           type="text"
//                           readOnly
//                           className="border p-2 w-full bg-gray-100"
//                           value={driver.F_name || ""}
//                         />
//                       </div>
//                       <div className="w-1/2">
//                         <label className="block text-sm font-medium">
//                           Last Name
//                         </label>
//                         <input
//                           type="text"
//                           readOnly
//                           className="border p-2 w-full bg-gray-100"
//                           value={driver.L_name || ""}
//                         />
//                       </div>
//                     </div>
//                     <div className="flex gap-4">
//                       <div className="w-1/2">
//                         <label className="block text-sm font-medium">
//                           {driver.idType === "in-state"
//                             ? "Driver's License / State ID Number"
//                             : driver.idType === "out-of-state"
//                             ? "Out-of-State Driver's License / State ID Number"
//                             : "International / Foreign ID / Passport Number"}
//                         </label>
//                         <input
//                           type="text"
//                           readOnly
//                           className="border p-2 w-full bg-gray-100"
//                           value={driver.licenseId || ""}
//                         />
//                       </div>
//                       {driver.idType === "out-of-state" && (
//                         <div className="w-1/2">
//                           <label className="block text-sm font-medium">
//                             State
//                           </label>
//                           <input
//                             type="text"
//                             readOnly
//                             className="border p-2 w-full bg-gray-100"
//                             value={driver.state || ""}
//                           />
//                         </div>
//                       )}
//                       {driver.idType === "international" && (
//                         <div className="w-1/2">
//                           <label className="block text-sm font-medium">
//                             Country
//                           </label>
//                           <input
//                             type="text"
//                             readOnly
//                             className="border p-2 w-full bg-gray-100"
//                             value={driver.country || ""}
//                           />
//                         </div>
//                       )}
//                     </div>
//                     <div className="flex gap-4">
//                       <div className="w-1/2">
//                         <label className="block text-sm font-medium">
//                           Date of Birth
//                         </label>
//                         <input
//                           type="text"
//                           readOnly
//                           className="border p-2 w-full bg-gray-100"
//                           value={driver.DOB || ""}
//                         />
//                       </div>
//                       {index === 0 && (
//                         <div className="w-1/2">
//                           <label className="block text-sm font-medium">
//                             Address
//                           </label>
//                           <input
//                             type="text"
//                             className="border p-2 w-full"
//                             readOnly={editingAddress !== index}
//                             value={driver.Address || ""}
//                             onChange={(e) => {
//                               const updatedDrivers = [...drivers];
//                               updatedDrivers[index].Address = e.target.value;
//                               setDrivers(updatedDrivers);
//                             }}
//                           />
//                           <button
//                             onClick={(e) => {
//                               e.preventDefault();
//                               setEditingAddress(
//                                 editingAddress === index ? null : index
//                               );
//                             }}
//                             className="text-blue-600 text-sm mt-1 underline"
//                           >
//                             {editingAddress === index
//                               ? "Lock Address"
//                               : "Update Address?"}
//                           </button>
//                         </div>
//                       )}
//                     </div>
//                     <div className="flex gap-4">
//                       <div className="w-1/2">
//                         <label className="block text-sm mb-1">
//                           Phone Number
//                         </label>
//                         <input
//                           type="tel"
//                           pattern="\d{10}"
//                           inputMode="numeric"
//                           maxLength={10}
//                           value={driver.phone || ""}
//                           onChange={(e) => {
//                             const value = e.target.value;
//                             if (/^\d{0,10}$/.test(value)) {
//                               const updatedDrivers = [...drivers];
//                               updatedDrivers[index].phone = value;
//                               setDrivers(updatedDrivers);
//                             }
//                           }}
//                           placeholder="Enter 10-digit phone number"
//                           className="border p-1.5 text-sm w-full rounded"
//                         />
//                       </div>
//                       {index === 0 && (
//                         <div className="w-1/2">
//                           <label className="block text-sm mb-1">
//                             Email Address
//                           </label>
//                           <input
//                             type="email"
//                             value={driver.email || ""}
//                             onChange={(e) => {
//                               const updatedDrivers = [...drivers];
//                               updatedDrivers[index].email = e.target.value;
//                               setDrivers(updatedDrivers);
//                             }}
//                             placeholder="Enter email"
//                             className="border p-1.5 text-sm w-full rounded"
//                           />
//                         </div>
//                       )}
//                     </div>
//                     <div className="flex gap-4">
//                       <div className="w-1/2">
//                         <label className="block text-sm font-medium">
//                           General Status
//                         </label>
//                         <input
//                           type="text"
//                           className="border p-2 w-full bg-gray-100"
//                           value={driver.generalStatus || ""}
//                         />
//                       </div>
//                       <div className="w-1/2">
//                         <label className="block text-sm font-medium">
//                           Marital Status
//                         </label>
//                         <input
//                           type="text"
//                           className="border p-2 w-full bg-gray-100"
//                           value={driver.maritalStatus || ""}
//                         />
//                       </div>
//                     </div>
//                     <div>
//                       <label className="block text-sm font-medium">
//                         Relationship
//                       </label>
//                       <input
//                         type="text"
//                         className="border p-2 w-full bg-gray-100"
//                         value={driver.relationship || ""}
//                       />
//                     </div>
//                     <button
//                       onClick={() => handleRemoveDriver(index)}
//                       className="mt-2 bg-red-500 text-white px-3 py-1 rounded text-sm"
//                     >
//                       Remove Driver
//                     </button>
//                   </div>
//                 ))}
//                 <div className="flex justify-center">
//                   <button
//                     onClick={handleNext}
//                     className="bg-blue-500 text-white px-4 py-2 rounded"
//                   >
//                     Confirm & Continue
//                   </button>
//                 </div>
//               </div>
//             )}
//           </div>
//         );

//       case 2:
//         return (
//           <div className="space-y-4">
//             <h2 className="text-lg font-semibold">Vehicle Info</h2>
//             <div className="flex justify-center">
//               <div className="flex flex-row flex-wrap gap-3 justify-center">
//                 <div
//                   onClick={() =>
//                     setFormData({ ...formData, vehicleInputType: "vin" })
//                   }
//                   className={`p-3 w-64 border rounded-lg cursor-pointer text-center text-sm ${
//                     formData.vehicleInputType === "vin"
//                       ? "bg-blue-100 border-blue-500"
//                       : "border-gray-300"
//                   }`}
//                 >
//                   VIN No. (Vehicle Identification Number)
//                 </div>
//                 <div
//                   onClick={() =>
//                     setFormData({ ...formData, vehicleInputType: "plate" })
//                   }
//                   className={`p-3 w-64 border rounded-lg cursor-pointer text-center text-sm ${
//                     formData.vehicleInputType === "plate"
//                       ? "bg-blue-100 border-blue-500"
//                       : "border-gray-300"
//                   }`}
//                 >
//                   License Plate No. (Metal Plate No.)
//                 </div>
//               </div>
//             </div>
//             {formData.vehicleInputType === "vin" && (
//               <div>
//                 <label className="block mb-1">VIN No.</label>
//                 <div className="flex gap-2 items-center">
//                   <input
//                     type="text"
//                     value={currentVin}
//                     onChange={(e) => setCurrentVin(e.target.value)}
//                     className="border p-2 flex-1 rounded"
//                     placeholder="Enter VIN No. (Vehicle Identification No.)"
//                     maxLength={17}
//                   />
//                   <button
//                     onClick={handleVinSearch}
//                     className="bg-blue-500 text-white px-4 py-2 rounded"
//                   >
//                     Add Vehicle
//                   </button>
//                 </div>
//                 {vinError && (
//                   <p className="text-red-500 text-sm mt-2">{vinError}</p>
//                 )}
//                 {vehicles.length > 0 && (
//                   <div className="mt-4 space-y-4">
//                     <h3 className="text-md font-semibold">Added Vehicles</h3>
//                     {vehicles.map((vehicle) => (
//                       <div
//                         key={vehicle.vin}
//                         className="p-4 bg-gray-50 rounded-lg border space-y-2"
//                       >
//                         <div>
//                           <label className="block mb-1 text-sm">
//                             VIN (Verified)
//                           </label>
//                           <input
//                             type="text"
//                             value={vehicle.vin || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <div>
//                           <label className="block mb-1 text-sm">Year</label>
//                           <input
//                             type="text"
//                             value={vehicle.year || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <div>
//                           <label className="block mb-1 text-sm">Make</label>
//                           <input
//                             type="text"
//                             value={vehicle.make || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <div>
//                           <label className="block mb-1 text-sm">Model</label>
//                           <input
//                             type="text"
//                             value={vehicle.model || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <button
//                           onClick={() => handleRemoveVehicle(vehicle.vin)}
//                           className="mt-2 bg-red-500 text-white px-3 py-1 rounded text-sm"
//                         >
//                           Remove
//                         </button>
//                       </div>
//                     ))}
//                     <div className="flex justify-center">
//                       <button
//                         onClick={handleNext}
//                         className="bg-blue-500 text-white px-4 py-2 rounded"
//                       >
//                         Confirm & Continue
//                       </button>
//                     </div>
//                   </div>
//                 )}
//               </div>
//             )}
//             {formData.vehicleInputType === "plate" && (
//               <div className="space-y-4">
//                 <div className="flex gap-4">
//                   <div className="w-1/2">
//                     <label className="block mb-1">License Plate No.</label>
//                     <input
//                       type="text"
//                       name="licenseplateno"
//                       value={formData.licenseplateno || ""}
//                       onChange={handleChange}
//                       className="border p-2 w-full rounded"
//                       placeholder="Enter License Plate No."
//                       maxLength={8}
//                     />
//                   </div>
//                   <div className="w-1/2">
//                     <label className="block mb-1">State</label>
//                     <select
//                       name="state"
//                       value={formData.state || ""}
//                       onChange={handleChange}
//                       className="border p-2 w-full rounded"
//                     >
//                       <option value="">Select State</option>
//                       {[
//                         "AL",
//                         "AK",
//                         "AZ",
//                         "AR",
//                         "CA",
//                         "CO",
//                         "CT",
//                         "DE",
//                         "FL",
//                         "GA",
//                         "HI",
//                         "ID",
//                         "IL",
//                         "IN",
//                         "IA",
//                         "KS",
//                         "KY",
//                         "LA",
//                         "ME",
//                         "MD",
//                         "MA",
//                         "MI",
//                         "MN",
//                         "MS",
//                         "MO",
//                         "MT",
//                         "NE",
//                         "NV",
//                         "NH",
//                         "NJ",
//                         "NM",
//                         "NY",
//                         "NC",
//                         "ND",
//                         "OH",
//                         "OK",
//                         "OR",
//                         "PA",
//                         "RI",
//                         "SC",
//                         "SD",
//                         "TN",
//                         "TX",
//                         "UT",
//                         "VT",
//                         "VA",
//                         "WA",
//                         "WV",
//                         "WI",
//                         "WY",
//                       ].map((state) => (
//                         <option key={state} value={state}>
//                           {state}
//                         </option>
//                       ))}
//                     </select>
//                   </div>
//                 </div>
//                 <div className="flex justify-center">
//                   <button
//                     onClick={handleLicensePlateSearch}
//                     className="bg-blue-500 text-white px-4 py-2 rounded"
//                   >
//                     Add Vehicle
//                   </button>
//                 </div>
//                 {lpError && (
//                   <p className="text-red-500 text-sm mt-2 text-center">
//                     {lpError}
//                   </p>
//                 )}
//                 {vehicles.length > 0 && (
//                   <div className="mt-4 space-y-4">
//                     <h3 className="text-md font-semibold">Added Vehicles</h3>
//                     {vehicles.map((vehicle) => (
//                       <div
//                         key={vehicle.vin}
//                         className="p-4 bg-gray-50 rounded-lg border space-y-2"
//                       >
//                         <div>
//                           <label className="block mb-1 text-sm">
//                             VIN (Verified)
//                           </label>
//                           <input
//                             type="text"
//                             value={vehicle.vin || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <div>
//                           <label className="block mb-1 text-sm">Year</label>
//                           <input
//                             type="text"
//                             value={vehicle.year || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <div>
//                           <label className="block mb-1 text-sm">Make</label>
//                           <input
//                             type="text"
//                             value={vehicle.make || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <div>
//                           <label className="block mb-1 text-sm">Model</label>
//                           <input
//                             type="text"
//                             value={vehicle.model || ""}
//                             readOnly
//                             className="border p-2 w-full bg-gray-100 rounded"
//                           />
//                         </div>
//                         <button
//                           onClick={() => handleRemoveVehicle(vehicle.vin)}
//                           className="mt-2 bg-red-500 text-white px-3 py-1 rounded text-sm"
//                         >
//                           Remove
//                         </button>
//                       </div>
//                     ))}
//                     <div className="flex justify-center">
//                       <button
//                         onClick={handleNext}
//                         className="bg-blue-500 text-white px-4 py-2 rounded"
//                       >
//                         Confirm & Continue
//                       </button>
//                     </div>
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>
//         );
//       case 3:
//         return (
//           <div className="space-y-4">
//             <h2 className="text-lg font-semibold">Coverage Type</h2>
//             <div>
//               <label className="block">Select Coverage</label>
//               <select
//                 name="coverage"
//                 value={formData.coverage}
//                 onChange={handleChange}
//                 className="border p-2 w-full"
//               >
//                 <option value="">Select...</option>
//                 <option value="liability">Liability</option>
//                 <option value="full">Full Coverage</option>
//               </select>
//             </div>
//           </div>
//         );
//       case 4:
//         return (
//           <div className="space-y-4">
//             <h2 className="text-lg font-semibold">Your Quote</h2>
//             <p>Based on your input, here’s your estimated price:</p>
//             <p className="text-lg font-bold">
//               ${formData.coverage === "liability" ? "50/month" : "100/month"}
//             </p>
//             <p>(This is a mock price for demo purposes.)</p>
//           </div>
//         );
//       default:
//         return null;
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gray-100 flex items-center justify-center p-0">
//       <div className="bg-white p-6 rounded-lg shadow-lg w-3/4 h-[90vh] max-w-none overflow-auto">
//         <div className="relative mb-6">
//           <div className="absolute top-1/2 w-full h-1 bg-gray-300 transform -translate-y-1/2" />
//           <div
//             className="absolute top-1/2 h-1 bg-blue-500 transform -translate-y-1/2"
//             style={{
//               width: `${((step - 1) / 3) * 100}%`,
//               transition: "width 0.3s",
//             }}
//           />
//           <div className="flex justify-between items-center relative z-10">
//             {[1, 2, 3, 4].map((num) => (
//               <div key={num} className="flex flex-col items-center">
//                 <div
//                   className={`w-6 h-6 flex items-center justify-center rounded-full ${
//                     step >= num ? "bg-blue-500 text-white" : "bg-gray-300"
//                   }`}
//                 >
//                   {num}
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//         {renderStep()}
//         <div className="mt-6 flex justify-between">
//           {step > 1 && (
//             <button
//               onClick={handleBack}
//               className="bg-gray-500 text-white px-4 py-2 rounded"
//             >
//               Back
//             </button>
//           )}
//           {step > 2 && step < 4 && (
//             <button
//               onClick={handleNext}
//               className="bg-blue-500 text-white px-4 py-2 rounded"
//             >
//               Next
//             </button>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// "use client";

// import Image from "next/image";

// import { useState, useEffect } from "react";

// export default function HomePage() {
//   const images = [
//     { src: "/car.png", alt: "Car" },

//     { src: "/motorcycle1.png", alt: "Motorcycle" },

//     { src: "/house1.png", alt: "House" }, // Add more image paths

//     { src: "/rental-apt1.png", alt: "Rental" }, // Add more image paths

//     { src: "/commercial1.png", alt: "Commercial" }, // Add more image paths

//     // Add more images as needed
//   ];

//   const [currentImageIndex, setCurrentImageIndex] = useState(0);

//   useEffect(() => {
//     const interval = setInterval(() => {
//       setCurrentImageIndex((prevIndex) =>
//         prevIndex === images.length - 1 ? 0 : prevIndex + 1
//       );
//     }, 5000); // Change image every 5 seconds

//     return () => clearInterval(interval); // Cleanup interval on component unmount
//   }, [images.length]);

//   return (
//     <>
//       <div className="relative bg-[#E5E5E5] py-16 px-4 sm:px-6 lg:px-8">
//         {/* Main container with flex layout for text and image */}

//         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between">
//           {/* Left side: Text and Button */}

//           <div className="lg:w-1/2 text-center lg:text-left">
//             <h1 className="text-5xl font-bold text-gray-900 mb-4">
//               We Compare, You Save!
//             </h1>

//             <p className="text-xl text-gray-700 mb-6">
//               Protecting what matters most: Auto, Home, Renters, Business, and
//               More.
//             </p>

//             <a
//               href="/quote"
//               className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-6 rounded-md hover:bg-[#102a56]"
//             >
//               GET QUOTE
//             </a>
//           </div>

//           {/* Right side: Auto-Scrolling Image */}

//           <div className="lg:w-1/2 relative mt-10 lg:mt-0">
//             <Image
//               src={images[currentImageIndex].src}
//               alt={images[currentImageIndex].alt}
//               width={600}
//               height={400}
//               className="object-contain"
//             />

//             {/* Cursor Indicator */}

//             <div className="flex justify-center mt-4 space-x-2">
//               {images.map((_, i) => (
//                 <span
//                   key={i}
//                   className={`w-4 h-1 ${
//                     i === currentImageIndex ? "bg-[#A0103D]" : "bg-gray-400"
//                   }`}
//                   style={{ borderRadius: "2px" }}
//                 ></span>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* Add margin-top to create space between sections */}

//         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

//         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between">
//           {/* Left side: Text and Button */}

//           <div className="lg:w-1/2 text-center lg:text-left">
//             <h1 className="text-5xl font-bold text-gray-900 mb-4">
//               Experience the Difference: Personalized Insurance Solutions
//             </h1>

//             <p className="text-xl text-gray-700 mb-6">
//               With acess to 30+ leading companies and over 10 years of industry
//               expertise, we’ll guide you to the right coverage. Don’t navigate
//               the insurance maze alone - schedule your free consultation and let
//               us help you find the perfect fit.
//             </p>
//           </div>

//           {/* Right side: Gradient Section with Card */}

//           <div className="lg:w-1/2 flex mt-10 lg:mt-0">
//             {/* Gradient Half */}

//             <div className="w-1/2 bg-gradient-to-b from-[#a0103d] to-[#102a56] text-white flex flex-col justify-center items-center p-6 rounded-l-md">
//               <div className="text-center">
//                 <p className="text-4xl font-bold">30+</p>

//                 <p className="text-lg">COMPANIES</p>
//               </div>

//               <div className="border-t border-white/50 my-4 w-3/4"></div>

//               <div className="text-center">
//                 <p className="text-4xl font-bold">10+</p>

//                 <p className="text-lg">YEARS EXPERIENCE</p>
//               </div>
//             </div>

//             {/* White Card Half */}

//             <div className="w-1/2 bg-white shadow-lg rounded-r-md p-6 flex flex-col justify-between">
//               <p className="text-lg text-gray-800 leading-relaxed">
//                 <h1 className="text-3xl">
//                   Not sure what kind of coverage you need?
//                 </h1>{" "}
//                 Speak with one of our professional agents—we’ll help you find
//                 the best and most affordable insurance option tailored for you.
//               </p>

//               <a
//                 href="tel:+14697295185"
//                 className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition text-center mt-4"
//               >
//                 CALL US
//               </a>
//             </div>
//           </div>
//         </div>

//         {/* Add margin-top to create space between sections */}

//         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

//         {/* Section with Header and GIF Cards */}

//         <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
//           {/* Header and Subheader */}

//           <div className="text-center mb-2">
//             <h2 className="text-4xl font-bold text-gray-900 mb-4">
//               Explore Your Coverage Options
//             </h2>

//             <p className="text-lg text-gray-700">
//               Get personalized quotes for all your insurance needs with just one
//               click.
//             </p>
//           </div>
//         </div>

//         {/* New Section with GIF Cards */}

//         <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
//             {/* Auto Card */}

//             <div className="bg-white rounded-lg shadow-md p-4 text-center">
//               <Image
//                 src="/car-animated.gif" // Replace with your GIF path
//                 alt="Auto"
//                 width={100}
//                 height={100}
//                 className="mx-auto mb-4 object-contain"
//               />

//               <p className="text-gray-700 mb-2">Auto</p>

//               <p className="text-sm text-gray-500 mb-4">
//                 Compare rates and save
//               </p>

//               <a
//                 href="/quote/auto"
//                 className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
//               >
//                 Quote Now &gt;&gt;
//               </a>
//             </div>

//             {/* Home Card */}

//             <div className="bg-white rounded-lg shadow-md p-4 text-center">
//               <Image
//                 src="/home-animated.gif" // Replace with your GIF path
//                 alt="Home"
//                 width={100}
//                 height={100}
//                 className="mx-auto mb-4 object-contain"
//               />

//               <p className="text-gray-700 mb-2">Home</p>

//               <p className="text-sm text-gray-500 mb-4">Protect your home</p>

//               <a
//                 href="/quote/home"
//                 className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
//               >
//                 Quote Now &gt;&gt;
//               </a>
//             </div>

//             {/* Rental Card */}

//             <div className="bg-white rounded-lg shadow-md p-4 text-center">
//               <Image
//                 src="/rental-animated.gif" // Replace with your GIF path
//                 alt="Rental"
//                 width={100}
//                 height={100}
//                 className="mx-auto mb-4 object-contain"
//               />

//               <p className="text-gray-700 mb-2">Rental</p>

//               <p className="text-sm text-gray-500 mb-4">
//                 Protect your business
//               </p>

//               <a
//                 href="/quote/rental"
//                 className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
//               >
//                 Quote Now &gt;&gt;
//               </a>
//             </div>

//             {/* Motorcycle Card */}

//             <div className="bg-white rounded-lg shadow-md p-4 text-center">
//               <Image
//                 src="/motorcycle-animated.gif" // Replace with your GIF path
//                 alt="Motorcycle"
//                 width={100}
//                 height={100}
//                 className="mx-auto mb-4 object-contain"
//               />

//               <p className="text-gray-700 mb-2">Motorcycle</p>

//               <p className="text-sm text-gray-500 mb-4">Protect your ride</p>

//               <a
//                 href="/quote/motorcycle"
//                 className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
//               >
//                 Quote Now &gt;&gt;
//               </a>
//             </div>

//             {/* Commercial Card */}

//             <div className="bg-white rounded-lg shadow-md p-4 text-center">
//               <Image
//                 src="/commercial-animated.gif" // Replace with your GIF path
//                 alt="Commercial"
//                 width={100}
//                 height={100}
//                 className="mx-auto mb-4 object-contain"
//               />

//               <p className="text-gray-700 mb-2">Commercial</p>

//               <p className="text-sm text-gray-500 mb-4">
//                 Protect your business
//               </p>

//               <a
//                 href="/quote/commercial"
//                 className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
//               >
//                 Quote Now &gt;&gt;
//               </a>
//             </div>

//             {/* Other Card */}

//             <div className="bg-white rounded-lg shadow-md p-4 text-center">
//               <Image
//                 src="/other-animated.gif" // Replace with your GIF path
//                 alt="Other"
//                 width={100}
//                 height={100}
//                 className="mx-auto mb-4 object-contain"
//               />

//               <p className="text-gray-700 mb-2">Other</p>

//               <p className="text-sm text-gray-500 mb-4">
//                 SR-22, Boat, RV, Mobile Home, Bond, Mexico Ins, other
//               </p>

//               <a
//                 href="/quote/other"
//                 className="inline-block bg-[#a0103d] text-white font-semibold py-2 px-4 rounded-md hover:bg-[#102a56] transition"
//               >
//                 Quote Now &gt;&gt;
//               </a>
//             </div>
//           </div>
//         </div>

//         {/* Add margin-top to create space between sections */}

//         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

//         {/* Customer Testimonials Section */}

//         <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
//           <div className="text-center mb-12">
//             <h2 className="text-4xl font-bold text-gray-900 mb-4">
//               What are customers saying?
//             </h2>
//           </div>

//           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
//             {/* Testimonial 1 */}

//             <div className="bg-white rounded-lg shadow-md p-6 text-center">
//               <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden">
//                 <Image
//                   src="/testo1.png" // Replace with your image path
//                   alt="Leslie Vance"
//                   width={96}
//                   height={96}
//                   className="object-cover"
//                 />
//               </div>

//               <p className="text-gray-700 mb-4 italic">
//                 Exceptional service every time from Texas Premium Insurance
//                 Services. They made starting a new policy easy and found a great
//                 price. Being able to manage everything via text is incredibly
//                 convenient. Their efficiency and attention to detail truly
//                 stands out!
//               </p>

//               <p className="text-gray-900 font-semibold">Leslie Vance</p>

//               <div className="flex justify-center mt-2">
//                 {Array(5)
//                   .fill(0)

//                   .map((_, i) => (
//                     <span key={i} className="text-cyan-600 text-xl">
//                       ★
//                     </span>
//                   ))}
//               </div>
//             </div>

//             {/* Testimonial 2 */}

//             <div className="bg-white rounded-lg shadow-md p-6 text-center">
//               <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden">
//                 <Image
//                   src="/testo2.png" // Replace with your image path
//                   alt="Darius Reed"
//                   width={96}
//                   height={96}
//                   className="object-cover"
//                 />
//               </div>

//               <p className="text-gray-700 mb-4 italic">
//                 The staff at Texas Premium Insurance Services are incredibly
//                 personal and always willing to work with you. They take the time
//                 to explain coverage, benefits, and costs, and are dedicated to
//                 finding the best rates—even for those with driving restrictions.
//               </p>

//               <p className="text-gray-900 font-semibold">Darius Reed</p>

//               <div className="flex justify-center mt-2">
//                 {Array(5)
//                   .fill(0)

//                   .map((_, i) => (
//                     <span key={i} className="text-cyan-600 text-xl">
//                       ★
//                     </span>
//                   ))}
//               </div>
//             </div>

//             {/* Testimonial 3 */}

//             <div className="bg-white rounded-lg shadow-md p-6 text-center">
//               <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden">
//                 <Image
//                   src="/testo3.png" // Replace with your image path
//                   alt="Maya Chen"
//                   width={96}
//                   height={96}
//                   className="object-cover"
//                 />
//               </div>

//               <p className="text-gray-700 mb-4 italic">
//                 Outstanding customer service! Texas Premium Insurance Services
//                 is truly a one-stop shop for all your insurance needs across the
//                 state. No matter where you are in Texas, they’ve got you
//                 covered!
//               </p>

//               <p className="text-gray-900 font-semibold">Maya Chen</p>

//               <div className="flex justify-center mt-2">
//                 {Array(5)
//                   .fill(0)

//                   .map((_, i) => (
//                     <span key={i} className="text-cyan-600 text-xl">
//                       ★
//                     </span>
//                   ))}
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Add margin-top to create space between sections */}

//         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mt-16"></div>

//         <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
//           <div className="text-center mb-12">
//             <h2 className="text-4xl font-bold text-gray-900 mb-4">
//               Compare and Save in 3 Easy Steps
//             </h2>
//           </div>

//           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
//             {/* Step 1 */}

//             <div className="bg-white rounded-lg shadow-md p-6 text-center">
//               <div className="flex justify-center mb-4">
//                 <div className="w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold">
//                   1
//                 </div>
//               </div>

//               <h3 className="text-xl font-semibold text-gray-900 mb-2">
//                 Tell Us About Yourself
//               </h3>

//               <p className="text-gray-600">
//                 Share a few details about your insurance needs so we can find
//                 the best options for you.
//               </p>
//             </div>

//             {/* Step 2 */}

//             <div className="bg-white rounded-lg shadow-md p-6 text-center">
//               <div className="flex justify-center mb-4">
//                 <div className="w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold">
//                   2
//                 </div>
//               </div>

//               <h3 className="text-xl font-semibold text-gray-900 mb-2">
//                 Compare Top Insurers
//               </h3>

//               <p className="text-gray-600">
//                 We’ll search 30+ leading companies to bring you the most
//                 competitive rates.
//               </p>
//             </div>

//             {/* Step 3 */}

//             <div className="bg-white rounded-lg shadow-md p-6 text-center">
//               <div className="flex justify-center mb-4">
//                 <div className="w-12 h-12 rounded-full bg-[#102a56] text-white flex items-center justify-center text-xl font-bold">
//                   3
//                 </div>
//               </div>

//               <h3 className="text-xl font-semibold text-gray-900 mb-2">
//                 Get Covered & Save
//               </h3>

//               <p className="text-gray-600">
//                 Choose your plan and start saving with coverage that fits your
//                 needs.
//               </p>
//             </div>
//           </div>
//         </div>

//         <div className="text-center mt-12">
//           <a
//             href="/quote"
//             className="inline-block bg-[#A0103D] text-white font-semibold py-3 px-8 rounded-full hover:bg-[#102a56] transition"
//           >
//             Start Your Quote
//           </a>
//         </div>
//       </div>
//     </>
//   );
// }

// 'use client';

// // import React, { useState, useEffect, useRef } from 'react';

// // const RootLayout = ({ children }: { children: React.ReactNode }) => {
// //   const [isDropdownOpen, setIsDropdownOpen] = useState(false);
// //   const dropdownRef = useRef<HTMLDivElement>(null);

// //   useEffect(() => {
// //     const handleClickOutside = (event: MouseEvent) => {
// //       if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
// //         setIsDropdownOpen(false);
// //       }
// //     };

// //     if (isDropdownOpen) {
// //       document.addEventListener('mousedown', handleClickOutside);
// //     }

// //     return () => {
// //       document.removeEventListener('mousedown', handleClickOutside);
// //     };
// //   }, [isDropdownOpen]);

// //   return (
// //     <div>
// //       <nav className="bg-[#E5E5E5] text-gray-900 p-5 flex justify-between items-center">
// //         <a href="/">
// //           <div className="flex items-center">
// //           <img src="logo.png" alt="Logo" className="h-30 w-auto" />
// //         </div>
// //         </a>
// //         <div className="flex items-center space-x-12 relative">
// //           <div className="relative" ref={dropdownRef}>
// //             <a
// //               href="/insurance"
// //               className="text-3xl hover:text-gray-600"
// //               onClick={(e) => {
// //                 e.preventDefault();
// //                 setIsDropdownOpen(!isDropdownOpen);
// //               }}
// //             >
// //               Choose Coverage
// //             </a>
// //             {isDropdownOpen && (
// //               <div className="absolute top-full left-0 mt-2 w-[600px] bg-white shadow-lg rounded-md py-4 px-6 z-10">
// //                 <div className="grid grid-cols-4 gap-6">
// //                   <div>
// //                     <h3 className="text-lg font-semibold text-gray-800 mb-2">Vehicles</h3>
// //                     <ul>
// //                       <li>
// //                         <a href="/insurance/auto" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Auto
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/motorcycle" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Motorcycle
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/boats" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Boats & Watercraft
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/rv" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           RV
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/sr22" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           SR-22
// //                         </a>
// //                       </li>
// //                     </ul>
// //                   </div>
// //                   <div>
// //                     <h3 className="text-lg font-semibold text-gray-800 mb-2">Property</h3>
// //                     <ul>
// //                       <li>
// //                         <a href="/insurance/homeowners" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Homeowners
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/renters" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Renters
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/mobile-home" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Mobile Home
// //                         </a>
// //                       </li>
// //                     </ul>
// //                   </div>
// //                   <div>
// //                     <h3 className="text-lg font-semibold text-gray-800 mb-2">Commercial</h3>
// //                     <ul>
// //                       <li>
// //                         <a href="/insurance/commercial-auto" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Commercial Auto
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/general-liability" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           General Liability
// //                         </a>
// //                       </li>
// //                     </ul>
// //                   </div>
// //                   <div>
// //                     <h3 className="text-lg font-semibold text-gray-800 mb-2">And More</h3>
// //                     <ul>
// //                       <li>
// //                         <a href="/insurance/mexico-tourist" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Mexico Tourist
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/surety-bond" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Surety Bond
// //                         </a>
// //                       </li>
// //                       <li>
// //                         <a href="/insurance/notary-services" className="block py-1 text-gray-700 hover:text-gray-900">
// //                           Notary Services
// //                         </a>
// //                       </li>
// //                     </ul>
// //                   </div>
// //                 </div>
// //               </div>
// //             )}
// //           </div>
// //           <a href="/about" className="text-3xl hover:text-gray-600">About Us</a>
// //           <a href="tel:+14697295185" className="text-3xl hover:text-gray-600">Call Now: (469) 729-5185</a>
// //         </div>
// //       </nav>
// //       {children}
// //       <footer className="bg-black text-white footer-text">
// //         <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
// //           <div className="flex flex-col md:flex-row justify-between items-center text-center md:text-left">
// //             <div className="mb-4 md:mb-0">
// //               <p className="text-sm text-white">
// //                 Contact Us:{' '}
// //                 <a href="tel:+14697295185" className="text-blue-400 hover:underline hover:text-blue-300">
// //                   (469) 729-5185
// //                 </a>
// //               </p>
// //               <p className="text-sm text-white">Mon - Sat | 9 a.m. - 7 p.m. CT</p>
// //             </div>
// //             <div className="flex space-x-4 mb-4 md:mb-0">
// //               <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
// //                 <svg className="w-6 h-6 text-white hover:text-blue-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
// //                   <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24h11.494v-9.294H9.694v-3.622h3.125V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.732 0 1.325-.593 1.325-1.324V1.325C24 .593 23.407 0 22.675 0z" />
// //                 </svg>
// //               </a>
// //               <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
// //                 <svg className="w-6 h-6 text-white hover:text-blue-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
// //                   <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.173.281 2.686.505.576.235 1.01.52 1.462.927.452.407.692.885.927 1.462.224.513.443 1.32.505 2.686.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.281 2.173-.505 2.686-.235.576-.52 1.01-.927 1.462-.407.452-.885.692-1.462.927-.513.224-1.32.443-2.686.505-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.173-.281-2.686-.505-.576-.235-1.01-.52-1.462-.927-.452-.407-.692-.885-.927-1.462-.224-.513-.443-1.32-.505-2.686-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.281-2.173.505-2.686.235-.576.52-1.01.927-1.462.407-.452.885-.692 1.462-.927.513-.224 1.32-.443 2.686-.505 1.266-.058 1.646-.07 4.85-.07m0-2.163C8.736 0 8.332.012 7.052.07c-1.338.064-2.127.287-2.784.611-.69.346-1.31.804-1.895 1.388-.585.584-1.042 1.205-1.388 1.895-.324.657-.547 1.446-.611 2.784C.012 8.332 0 8.736 0 12s.012 3.668.07 4.948c.064 1.338.287 2.127.611 2.784.346.69.804 1.31 1.388 1.895.584.585 1.205 1.042 1.895 1.388.657.324 1.446.547 2.784.611 1.28.058 1.684.07 4.948.07s3.668-.012 4.948-.07c1.338-.064 2.127-.287 2.784-.611.69-.346 1.31-.804 1.895-1.388.585-.584 1.042-1.205 1.388-1.895.324-.657.547-1.446.611-2.784.058-1.28.07-1.684.07-4.948s-.012-3.668-.07-4.948c-.064-1.338-.287-2.127-.611-2.784-.346-.69-.804-1.31-1.388-1.895-.584-.585-1.205-1.042-1.895-1.388-.657-.324-1.446-.547-2.784-.611-1.28-.058-1.684-.07-4.948-.07zM12 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c0 .796-.646 1.442-1.442 1.442-.796 0-1.442-.646-1.442-1.442 0-.796.646-1.442 1.442-1.442.796 0 1.442.646 1.442 1.442z" />
// //                 </svg>
// //               </a>
// //               <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter">
// //                 <svg className="w-6 h-6 text-white hover:text-blue-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
// //                   <path d="M23.954 4.569c-.885.39-1.83.654-2.825.775 1.014-.611 1.794-1.574 2.163-2.723-.951.555-2.005.959-3.127 1.184-.896-.959-2.173-1.559-3.591-1.559-2.717 0-4.92 2.203-4.92 4.917 0 .39.045.765.127 1.124C7.691 8.094 4.066 6.13 1.64 3.161c-.427.722-.666 1.561-.666 2.475 0 1.71.87 3.213 2.188 4.096-.807-.026-1.566-.248-2.228-.616v.061c0 2.385 1.693 4.374 3.946 4.827-.413.111-.849.171-1.296.171-.314 0-.615-.03-.916-.086.631 1.953 2.445 3.377 4.604 3.417-1.68 1.319-3.809 2.105-6.102 2.105-.39 0-.779-.023-1.17-.067 2.189 1.394 4.768 2.209 7.557 2.209 9.054 0 14.008-7.496 14.008-13.985 0-.21 0-.42-.015-.63.961-.695 1.8-1.562 2.457-2.549l-.047-.02z" />
// //                 </svg>
// //               </a>
// //               <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
// //                 <svg className="w-6 h-6 text-white hover:text-blue-400" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
// //                   <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.555 15.71v-7.397l7.297 3.697-7.297 3.7z" />
// //                 </svg>
// //               </a>
// //             </div>
// //             <div className="text-sm text-white">
// //               <p className="text-white">© 2025 Texas Premium Insurance Services, LLC</p>
// //               <p className="mt-2">
// //                 <a href="/terms" className="underline text-white hover:text-blue-400">
// //                   Terms of Service
// //                 </a>{' '}
// //                 |{' '}
// //                 <a href="/privacy" className="underline text-white hover:text-blue-400">
// //                   Privacy Policy
// //                 </a>{' '}
// //                 |{' '}
// //                 <a href="/licenses" className="underline text-white hover:text-blue-400">
// //                   Licenses
// //                 </a>{' '}
// //                 |{' '}
// //                 <a href="/accessibility" className="underline text-white hover:text-blue-400">
// //                   Accessibility
// //                 </a>
// //               </p>
// //             </div>
// //           </div>
// //           <div className="max-w-7xl mx-auto mt-4 border-t border-gray-600 pt-4 text-sm text-white">
// //             <p className="text-white">
// //               Texas Premium Insurance Services LLC is an insurance agency that sources quotes from multiple carriers to provide you with the most competitive rates. By submitting information through our online portal or forms, you certify that all details, including household residents, accidents, DUIs/DWIs, tickets, and any expired or suspended licenses, are accurate and complete to the best of your knowledge. This applies whether you receive an immediate quote or are contacted by an agency representative to finalize your quote. Failure to provide accurate information may result in increased premiums, policy cancellation, or denial of coverage. Claims are processed and paid by the selected insurance carrier. Our agency will assist you with the claims process but is not responsible for claim denials due to misrepresentation, fraud, non-disclosure of material facts, policy exclusions, or any other reason.
// //             </p>
// //           </div>
// //         </div>
// //       </footer>
// //     </div>
// //   );
// // };

// // export default RootLayout;

// "use client";

// import React, { useState, useEffect, useRef } from "react";
// import Link from "next/link";

// const RootLayout = ({ children }: { children: React.ReactNode }) => {
//   const [isGetInsuranceOpen, setIsGetInsuranceOpen] = useState(false);
//   const [isAboutOpen, setIsAboutOpen] = useState(false);
//   const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//   const getInsuranceRef = useRef<HTMLDivElement>(null);
//   const aboutRef = useRef<HTMLDivElement>(null);
//   const dropdownRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     const handleClickOutside = (event: MouseEvent) => {
//       if (
//         getInsuranceRef.current &&
//         !getInsuranceRef.current.contains(event.target as Node)
//       ) {
//         setIsGetInsuranceOpen(false);
//       }
//       if (
//         aboutRef.current &&
//         !aboutRef.current.contains(event.target as Node)
//       ) {
//         setIsAboutOpen(false);
//       }
//     };

//     const handleResize = () => {
//       if (
//         isGetInsuranceOpen &&
//         dropdownRef.current &&
//         getInsuranceRef.current
//       ) {
//         const dropdown = dropdownRef.current;
//         const button = getInsuranceRef.current;
//         const rect = button.getBoundingClientRect();
//         const viewportWidth = window.innerWidth;

//         // Check if dropdown exceeds the right edge of the screen
//         const dropdownWidth = dropdown.offsetWidth; // 600px from w-[600px]
//         if (rect.right + dropdownWidth > viewportWidth) {
//           // Reposition to the left or adjust right
//           const offset = viewportWidth - rect.right;
//           dropdown.style.left = `${offset - dropdownWidth}px`; // Move left if needed
//           dropdown.style.right = "auto"; // Reset right if previously set
//         } else {
//           dropdown.style.left = "0"; // Default left alignment
//           dropdown.style.right = "auto";
//         }
//       }
//     };

//     if (isGetInsuranceOpen || isAboutOpen) {
//       document.addEventListener("mousedown", handleClickOutside);
//       window.addEventListener("resize", handleResize);
//       handleResize(); // Initial positioning
//     }

//     return () => {
//       document.removeEventListener("mousedown", handleClickOutside);
//       window.removeEventListener("resize", handleResize);
//     };
//   }, [isGetInsuranceOpen, isAboutOpen]);

//   const handleNavClick = () => {
//     setIsMobileMenuOpen(false);
//     setIsGetInsuranceOpen(false);
//     setIsAboutOpen(false);
//   };

//   return (
//     <div>
//       {/* <nav className="bg-white text-gray-800 px-6 py-4 flex items-center border-b border-gray-200 max-w-screen-xl mx-auto"> */}
//       <nav className="bg-[#E5E5E5] text-gray-900 p-5 flex justify-between items-center">
//         {/* Logo */}
//         <Link href="/" onClick={handleNavClick} className="flex items-center">
//           <img
//             src="/logo.png"
//             alt="Texas Premium Insurance Services"
//             className="h-30 w-auto"
//           />
//         </Link>

//         {/* Navigation */}
//         <div className="flex-grow flex items-center justify-around relative">
//           {/* Hamburger Icon (Visible on Mobile Only) */}
//           <button
//             className="md:hidden text-3xl focus:outline-none transition-transform duration-300 ml-auto"
//             onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
//           >
//             {isMobileMenuOpen ? "✕" : "☰"}
//           </button>

//           {/* Menu Items */}
//           <div
//             className={`${
//               isMobileMenuOpen ? "block" : "hidden"
//             } md:flex md:items-center absolute md:static top-full left-0 w-full md:w-full bg-white md:bg-transparent p-4 md:p-0 transition-all duration-500 ease-in-out z-20 ${
//               isMobileMenuOpen ? "space-y-4" : "md:space-x-6 md:flex-row"
//             }`} // Changed to md:justify-around and md:flex-grow
//           >
//             <div className="md:flex md:justify-around md:flex-grow space-y-4 md:space-y-0">
//               {/* Get Insurance Dropdown */}
//               <div className="relative" ref={getInsuranceRef}>
//                 <button
//                   onClick={(e) => {
//                     e.preventDefault();
//                     setIsGetInsuranceOpen(!isGetInsuranceOpen);
//                   }}
//                   className="text-base md:text-lg font-medium hover:text-[#a0103d] transition-colors duration-200 flex items-center"
//                 >
//                   <b>Get Insurance ▼</b>
//                 </button>
//                 {isGetInsuranceOpen && (
//                   <div
//                     ref={dropdownRef}
//                     className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-[95vw] max-w-[600px] bg-white rounded-md py-4 px-6 z-10 overflow-x-auto"
//                   >
//                     <div className="grid grid-cols-4 gap-6">
//                       <div>
//                         <h3 className="text-lg font-semibold text-gray-800 mb-2">
//                           Vehicles
//                         </h3>
//                         <ul>
//                           <li>
//                             <a
//                               href="/insurance/auto"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Auto
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/motorcycle"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Motorcycle
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/boats"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Boats & Watercraft
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/rv"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               RV
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/sr22"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               SR-22
//                             </a>
//                           </li>
//                         </ul>
//                       </div>
//                       <div>
//                         <h3 className="text-lg font-semibold text-gray-800 mb-2">
//                           Property
//                         </h3>
//                         <ul>
//                           <li>
//                             <a
//                               href="/insurance/homeowners"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Homeowners
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/renters"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Renters
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/mobile-home"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Mobile Home
//                             </a>
//                           </li>
//                         </ul>
//                       </div>
//                       <div>
//                         <h3 className="text-lg font-semibold text-gray-800 mb-2">
//                           Commercial
//                         </h3>
//                         <ul>
//                           <li>
//                             <a
//                               href="/insurance/commercial-auto"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Commercial Auto
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/general-liability"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               General Liability
//                             </a>
//                           </li>
//                         </ul>
//                       </div>
//                       <div>
//                         <h3 className="text-lg font-semibold text-gray-800 mb-2">
//                           And More
//                         </h3>
//                         <ul>
//                           <li>
//                             <a
//                               href="/insurance/mexico-tourist"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Mexico Tourist
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/surety-bond"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Surety Bond
//                             </a>
//                           </li>
//                           <li>
//                             <a
//                               href="/insurance/notary-services"
//                               className="block py-1 text-gray-700 hover:text-[#a0103d]"
//                             >
//                               Notary Services
//                             </a>
//                           </li>
//                         </ul>
//                       </div>
//                     </div>
//                   </div>
//                 )}
//               </div>

//               {/* About Link */}
//               <div className="relative" ref={aboutRef}>
//                 <Link
//                   href="/about"
//                   onClick={handleNavClick}
//                   className="text-base md:text-lg font-medium hover:text-[#a0103d] transition-colors duration-200"
//                 >
//                   <b>About Us</b>
//                 </Link>
//               </div>

//               {/* Phone Link */}
//               <a
//                 href="tel:+14697295185"
//                 onClick={handleNavClick}
//                 className="relative inline-flex items-center justify-center px-6 py-2 md:py-3 bg-[#a0103d] text-white text-sm md:text-base font-semibold rounded-full shadow-md hover:bg-[#7d0b2e] transition duration-300 ease-in-out group overflow-hidden"
//               >
//                 <span className="absolute inset-0 w-full h-full bg-white opacity-10 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out origin-left rounded-full" />
//                 📞 Call Now 469-729-5185
//               </a>
//             </div>
//           </div>
//         </div>
//       </nav>
//       {children}
//       <footer className="bg-black text-white footer-text">
//         <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
//           <div className="flex flex-col md:flex-row justify-between items-center text-center md:text-left">
//             <div className="mb-4 md:mb-0">
//               <p className="text-sm text-white">
//                 Contact Us:{" "}
//                 <a
//                   href="tel:+14697295185"
//                   className="text-blue-400 hover:underline hover:text-blue-300"
//                 >
//                   (469) 729-5185
//                 </a>
//               </p>
//               <p className="text-sm text-white">
//                 Mon - Sat | 9 a.m. - 7 p.m. CT
//               </p>
//             </div>
//             <div className="flex space-x-4 mb-4 md:mb-0">
//               <a
//                 href="https://facebook.com"
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 aria-label="Facebook"
//               >
//                 <svg
//                   className="w-6 h-6 text-white hover:text-blue-400"
//                   fill="currentColor"
//                   viewBox="0 0 24 24"
//                   xmlns="http://www.w3.org/2000/svg"
//                 >
//                   <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24h11.494v-9.294H9.694v-3.622h3.125V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.732 0 1.325-.593 1.325-1.324V1.325C24 .593 23.407 0 22.675 0z" />
//                 </svg>
//               </a>
//               <a
//                 href="https://instagram.com"
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 aria-label="Instagram"
//               >
//                 <svg
//                   className="w-6 h-6 text-white hover:text-blue-400"
//                   fill="currentColor"
//                   viewBox="0 0 24 24"
//                   xmlns="http://www.w3.org/2000/svg"
//                 >
//                   <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.173.281 2.686.505.576.235 1.01.52 1.462.927.452.407.692.885.927 1.462.224.513.443 1.32.505 2.686.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.281 2.173-.505 2.686-.235.576-.52 1.01-.927 1.462-.407.452-.885.692-1.462.927-.513.224-1.32.443-2.686.505-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.173-.281-2.686-.505-.576-.235-1.01-.52-1.462-.927-.452-.407-.692-.885-.927-1.462-.224-.513-.443-1.32-.505-2.686-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.281-2.173.505-2.686.235-.576.52-1.01.927-1.462.407-.452.885-.692 1.462-.927.513-.224 1.32-.443 2.686-.505 1.266-.058 1.646-.07 4.85-.07m0-2.163C8.736 0 8.332.012 7.052.07c-1.338.064-2.127.287-2.784.611-.69.346-1.31.804-1.895 1.388-.585.584-1.042 1.205-1.388 1.895-.324.657-.547 1.446-.611 2.784C.012 8.332 0 8.736 0 12s.012 3.668.07 4.948c.064 1.338.287 2.127.611 2.784.346.69.804 1.31 1.388 1.895.584.585 1.205 1.042 1.895 1.388.657.324 1.446.547 2.784.611 1.28.058 1.684.07 4.948.07s3.668-.012 4.948-.07c1.338-.064 2.127-.287 2.784-.611.69-.346 1.31-.804 1.895-1.388.585-.584 1.042-1.205 1.388-1.895.324-.657.547-1.446.611-2.784.058-1.28.07-1.684.07-4.948s-.012-3.668-.07-4.948c-.064-1.338-.287-2.127-.611-2.784-.346-.69-.804-1.31-1.388-1.895-.584-.585-1.205-1.042-1.895-1.388-.657-.324-1.446-.547-2.784-.611-1.28-.058-1.684-.07-4.948-.07zM12 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4zm6.406-11.845c0 .796-.646 1.442-1.442 1.442-.796 0-1.442-.646-1.442-1.442 0-.796.646-1.442 1.442-1.442.796 0 1.442.646 1.442 1.442z" />
//                 </svg>
//               </a>
//               <a
//                 href="https://twitter.com"
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 aria-label="Twitter"
//               >
//                 <svg
//                   className="w-6 h-6 text-white hover:text-blue-400"
//                   fill="currentColor"
//                   viewBox="0 0 24 24"
//                   xmlns="http://www.w3.org/2000/svg"
//                 >
//                   <path d="M23.954 4.569c-.885.39-1.83.654-2.825.775 1.014-.611 1.794-1.574 2.163-2.723-.951.555-2.005.959-3.127 1.184-.896-.959-2.173-1.559-3.591-1.559-2.717 0-4.92 2.203-4.92 4.917 0 .39.045.765.127 1.124C7.691 8.094 4.066 6.13 1.64 3.161c-.427.722-.666 1.561-.666 2.475 0 1.71.87 3.213 2.188 4.096-.807-.026-1.566-.248-2.228-.616v.061c0 2.385 1.693 4.374 3.946 4.827-.413.111-.849.171-1.296.171-.314 0-.615-.03-.916-.086.631 1.953 2.445 3.377 4.604 3.417-1.68 1.319-3.809 2.105-6.102 2.105-.39 0-.779-.023-1.17-.067 2.189 1.394 4.768 2.209 7.557 2.209 9.054 0 14.008-7.496 14.008-13.985 0-.21 0-.42-.015-.63.961-.695 1.8-1.562 2.457-2.549l-.047-.02z" />
//                 </svg>
//               </a>
//               <a
//                 href="https://youtube.com"
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 aria-label="YouTube"
//               >
//                 <svg
//                   className="w-6 h-6 text-white hover:text-blue-400"
//                   fill="currentColor"
//                   viewBox="0 0 24 24"
//                   xmlns="http://www.w3.org/2000/svg"
//                 >
//                   <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.555 15.71v-7.397l7.297 3.697-7.297 3.7z" />
//                 </svg>
//               </a>
//             </div>
//             <div className="text-sm text-white">
//               <p className="text-white">
//                 © 2025 Texas Premium Insurance Services, LLC
//               </p>
//               <p className="mt-2">
//                 <a
//                   href="/terms"
//                   className="underline text-white hover:text-blue-400"
//                 >
//                   Terms of Service
//                 </a>{" "}
//                 |{" "}
//                 <a
//                   href="/privacy"
//                   className="underline text-white hover:text-blue-400"
//                 >
//                   Privacy Policy
//                 </a>{" "}
//                 |{" "}
//                 <a
//                   href="/licenses"
//                   className="underline text-white hover:text-blue-400"
//                 >
//                   Licenses
//                 </a>{" "}
//                 |{" "}
//                 <a
//                   href="/accessibility"
//                   className="underline text-white hover:text-blue-400"
//                 >
//                   Accessibility
//                 </a>
//               </p>
//             </div>
//           </div>
//           <div className="max-w-7xl mx-auto mt-4 border-t border-gray-600 pt-4 text-sm text-white">
//             <p className="text-white">
//               Texas Premium Insurance Services LLC is an insurance agency that
//               sources quotes from multiple carriers to provide you with the most
//               competitive rates. By submitting information through our online
//               portal or forms, you certify that all details, including household
//               residents, accidents, DUIs/DWIs, tickets, and any expired or
//               suspended licenses, are accurate and complete to the best of your
//               knowledge. This applies whether you receive an immediate quote or
//               are contacted by an agency representative to finalize your quote.
//               Failure to provide accurate information may result in increased
//               premiums, policy cancellation, or denial of coverage. Claims are
//               processed and paid by the selected insurance carrier. Our agency
//               will assist you with the claims process but is not responsible for
//               claim denials due to misrepresentation, fraud, non-disclosure of
//               material facts, policy exclusions, or any other reason.
//             </p>
//           </div>
//         </div>
//       </footer>
//     </div>
//   );
// };

// export default RootLayout;
