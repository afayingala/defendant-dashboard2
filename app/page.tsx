"use client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useState, useEffect, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table"
import { ArrowUpDown, Phone } from "lucide-react"
import Papa from "papaparse"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts"

// Define proper types
type CSVRow = {
  [key: string]: string | number | undefined;
  collectedAmount?: number;
  __originalIndex?: number;
}

type PapaParseResult = {
  data: CSVRow[];
  errors: any[];
  meta: any;
}

export default function Home() {
  const [activeFilter, setActiveFilter] = useState("Captira")
  const [data, setData] = useState<CSVRow[]>([])
  const [columns, setColumns] = useState<ColumnDef<CSVRow>[]>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedDefendant, setSelectedDefendant] = useState<CSVRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dashboardData, setDashboardData] = useState<any>({
    balanceDistribution: [],
    paymentAging: [],
    locationDistribution: []
  })
  
  const [statCards, setStatCards] = useState({
    totalRecords: 0,
    totalBalance: 0,
    currentBalance: 0,
    percentagePaid: 0
  })

  const [collectDialogOpen, setCollectDialogOpen] = useState(false)
  const [selectedRowForCollection, setSelectedRowForCollection] = useState<CSVRow | null>(null)
  const [collectionAmountInput, setCollectionAmountInput] = useState("")

  const [yearFilter, setYearFilter] = useState<string>("all")
  const [balanceRangeFilter, setBalanceRangeFilter] = useState<number[]>([0, 0])
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [minBalance, setMinBalance] = useState(0)
  const [maxBalance, setMaxBalance] = useState(0)

  useEffect(() => {
    if (activeFilter === "Captira" || activeFilter === "Simply" || activeFilter === "Joint") {
      loadCSVData()
    }
  }, [activeFilter])

  const loadCSVData = async () => {
    setLoading(true)
    try {
      const fileName = 
        activeFilter === "Captira" ? "captira-dataa.csv" : 
        activeFilter === "Simply" ? "simply-data.csv" : 
        "joint-data.csv";
      
      const response = await fetch(`/${fileName}`);
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header) => header.trim(),
        complete: (results: PapaParseResult) => {
          if (results.data && results.data.length > 0) {
            const firstRow = results.data[0];
            if (firstRow && typeof firstRow === 'object' && firstRow !== null) {
              const headers = Object.keys(firstRow)
              
              const excludedColumns = 
                activeFilter === "Simply" 
                  ? ["Def. Phone"]
                  : activeFilter === "Joint"
                  ? ["Contact", "_source"]
                  : ["Address", "City", "State", "Zip", "Mobile Ph #", "Date of Birth"];
              
              const filteredHeaders = headers.filter(header => 
                !excludedColumns.includes(header)
              )
              
              const columnDefs: ColumnDef<CSVRow>[] = filteredHeaders.map(header => ({
                id: header,
                accessorFn: (row) => row[header],
                header: ({ column }) => (
                  <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800 -ml-4"
                  >
                    {header}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                ),
                cell: ({ getValue }) => (
                  <div className="py-2">{String(getValue?.() || '-')}</div>
                ),
              }))
              
              const actionColumns: ColumnDef<CSVRow>[] = [
                {
                  id: 'collectedAmount',
                  accessorKey: 'collectedAmount',
                  header: 'Collected Amount',
                  cell: ({ row }) => (
                    <div className="py-2 font-semibold text-green-600">
                      ${(row.original.collectedAmount || 0).toFixed(2)}
                    </div>
                  ),
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  cell: ({ row }) => (
                    <div className="flex gap-2 py-2 justify-center">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDefendant(row.original);
                          setDialogOpen(true);
                        }}
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="default"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCollectClick(row.original);
                        }}
                      >
                        Collect
                      </Button>
                    </div>
                  ),
                }
              ];
              
              setColumns([...columnDefs, ...actionColumns])
              
              const rowsWithCollectedAmount = results.data.map((row, index) => ({
                ...row,
                collectedAmount: 0,
                __originalIndex: index
              }));
              
              setData(rowsWithCollectedAmount)
              calculateFilters(rowsWithCollectedAmount)
              calculateDashboardData(rowsWithCollectedAmount)
            }
          }
        },
        error: (error: Error) => {
          console.error('CSV parsing error:', error)
        }
      })
    } catch (error) {
      console.error('Error loading CSV:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateFilters = (csvData: CSVRow[]) => {
    let min = Infinity
    let max = -Infinity
    
    csvData.forEach((row) => {
      let balanceField
      if (activeFilter === "Simply") {
        balanceField = row['Outstanding Balance'] || row['Total Due'] || '0'
      } else if (activeFilter === "Joint") {
        balanceField = row['Current_Balance'] || '0'
      } else {
        balanceField = row['Balance Owed'] || row['Current Balance'] || row['Balance'] || '0'
      }
      
      const balance = parseFloat(String(balanceField || '0').replace(/[$,]/g, '')) || 0
      min = Math.min(min, balance)
      max = Math.max(max, balance)
    })
    
    setMinBalance(min === Infinity ? 0 : min)
    setMaxBalance(max === -Infinity ? 0 : max)
    setBalanceRangeFilter([min === Infinity ? 0 : min, max === -Infinity ? 0 : max])
    
    if (activeFilter === "Captira") {
      const years = new Set<string>()
      csvData.forEach((row) => {
        const dateField = row['Last Payment Date']
        if (dateField) {
          try {
            const year = new Date(dateField).getFullYear()
            if (!isNaN(year)) {
              years.add(year.toString())
            }
          } catch (e) {}
        }
      })
      setAvailableYears(Array.from(years).sort().reverse())
      setYearFilter("all")
    } else {
      setAvailableYears([])
      setYearFilter("all")
    }
  }

  const filteredData = useMemo(() => {
    if (!data.length) return []
    
    return data.filter((row) => {
      if (yearFilter !== "all" && activeFilter === "Captira") {
        const dateField = row['Last Payment Date']
        if (dateField) {
          try {
            const rowYear = new Date(dateField).getFullYear().toString()
            if (rowYear !== yearFilter) return false
          } catch (e) {
            return false
          }
        } else {
          return false
        }
      }
      
      let balanceField
      if (activeFilter === "Simply") {
        balanceField = row['Outstanding Balance'] || row['Total Due'] || '0'
      } else if (activeFilter === "Joint") {
        balanceField = row['Current_Balance'] || '0'
      } else {
        balanceField = row['Balance Owed'] || row['Current Balance'] || row['Balance'] || '0'
      }
      
      const balance = parseFloat(String(balanceField || '0').replace(/[$,]/g, '')) || 0
      if (balance < balanceRangeFilter[0] || balance > balanceRangeFilter[1]) return false
      
      return true
    })
  }, [data, yearFilter, balanceRangeFilter, activeFilter])

  const handleCollectClick = (row: CSVRow) => {
    setSelectedRowForCollection(row)
    setCollectionAmountInput("")
    setCollectDialogOpen(true)
  }

  const handleSubmitCollection = () => {
    if (!selectedRowForCollection) return
    
    const amount = parseFloat(collectionAmountInput)
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount")
      return
    }

    const rowIndex = selectedRowForCollection.__originalIndex
    if (rowIndex === undefined || rowIndex === -1) return

    const newData = [...data]
    const targetRow = { ...newData[rowIndex] }
    
    const currentCollected = targetRow.collectedAmount || 0
    targetRow.collectedAmount = currentCollected + amount

    let balanceField: string
    let currentBalance: number
    
    if (activeFilter === "Simply") {
      balanceField = "Outstanding Balance"
      currentBalance = parseFloat(String(targetRow[balanceField] || "0").replace(/[$,]/g, '')) || 0
      targetRow[balanceField] = `$${(currentBalance - amount).toFixed(2)}`
    } else if (activeFilter === "Joint") {
      balanceField = "Current_Balance"
      currentBalance = parseFloat(String(targetRow[balanceField] || "0").replace(/[$,]/g, '')) || 0
      targetRow[balanceField] = `$${(currentBalance - amount).toFixed(2)}`
    } else {
      balanceField = targetRow["Current Balance"] !== undefined ? "Current Balance" : "Balance Owed"
      currentBalance = parseFloat(String(targetRow[balanceField] || "0").replace(/[$,]/g, '')) || 0
      targetRow[balanceField] = `$${(currentBalance - amount).toFixed(2)}`
    }

    newData[rowIndex] = targetRow
    setData(newData)
    
    calculateFilters(newData)
    calculateDashboardData(newData)

    setCollectDialogOpen(false)
    setSelectedRowForCollection(null)
    setCollectionAmountInput("")
  }

  const calculateDashboardData = (csvData: CSVRow[]) => {
    const balanceRanges = {
      '0–500': 0,
      '501–1,000': 0,
      '1,001–3,000': 0,
      '3,001–5,000': 0,
      '5,001+': 0
    }

    const agingBuckets = {
      '0–30 days': 0,
      '31–60 days': 0,
      '61–90 days': 0,
      '91+ days': 0
    }

    const locationCounts: { [key: string]: number } = {}
    const today = new Date()
    
    let cumulativeTotalBalance = 0
    let cumulativeCurrentBalance = 0

    csvData.forEach((row) => {
      let balance = 0
      let balanceField
      
      if (activeFilter === "Simply") {
        balanceField = row['Outstanding Balance'] || row['Total Due'] || '0'
      } else if (activeFilter === "Joint") {
        balanceField = row['Current_Balance'] || '0'
      } else {
        balanceField = row['Balance Owed'] || row['Current Balance'] || row['Balance'] || '0'
      }
      
      if (typeof balanceField === 'string') {
        balance = parseFloat(balanceField.replace(/[$,]/g, ''))
      } else {
        balance = parseFloat(String(balanceField || '0').replace(/[$,]/g, '')) || 0
      }

      if (!isNaN(balance)) {
        if (balance <= 500) balanceRanges['0–500']++
        else if (balance <= 1000) balanceRanges['501–1,000']++
        else if (balance <= 3000) balanceRanges['1,001–3,000']++
        else if (balance <= 5000) balanceRanges['3,001–5,000']++
        else if (balance > 5000) balanceRanges['5,001+']++
      }

      if (activeFilter === "Captira" && row['Last Payment Date']) {
        try {
          const paymentDate = new Date(row['Last Payment Date'])
          if (!isNaN(paymentDate.getTime())) {
            const daysSince = Math.floor((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24))
            
            if (daysSince <= 30) agingBuckets['0–30 days']++
            else if (daysSince <= 60) agingBuckets['31–60 days']++
            else if (daysSince <= 90) agingBuckets['61–90 days']++
            else agingBuckets['91+ days']++
          }
        } catch (e) {}
      }

      if (activeFilter === "Captira" && row['City']) {
        const city = typeof row['City'] === 'string' ? row['City'].trim() : ''
        if (city) {
          locationCounts[city] = (locationCounts[city] || 0) + 1
        }
      }

      let totalDue, currentBalance
      
      if (activeFilter === "Simply") {
        totalDue = parseFloat(String(row['Total Due'] || '0').replace(/[$,]/g, '')) || 0
        currentBalance = parseFloat(String(row['Outstanding Balance'] || '0').replace(/[$,]/g, '')) || 0
      } else if (activeFilter === "Joint") {
        totalDue = parseFloat(String(row['Total_Balance'] || '0').replace(/[$,]/g, '')) || 0
        currentBalance = parseFloat(String(row['Current_Balance'] || '0').replace(/[$,]/g, '')) || 0
      } else {
        totalDue = parseFloat(String(row['Balance Owed'] || row['Current Balance'] || row['Balance'] || '0').replace(/[$,]/g, '')) || 0
        currentBalance = parseFloat(String(row['Current Balance'] || row['Balance Owed'] || row['Balance'] || '0').replace(/[$,]/g, '')) || 0
      }
      
      cumulativeTotalBalance += totalDue
      cumulativeCurrentBalance += currentBalance
    })

    const percentagePaid = cumulativeTotalBalance > 0 
      ? ((cumulativeTotalBalance - cumulativeCurrentBalance) / cumulativeTotalBalance) * 100 
      : 0

    setStatCards({
      totalRecords: csvData.length,
      totalBalance: cumulativeTotalBalance,
      currentBalance: cumulativeCurrentBalance,
      percentagePaid: percentagePaid
    })

    const balanceData = Object.entries(balanceRanges).map(([range, count]) => ({
      range,
      count
    }))

    const agingData = activeFilter === "Captira"
      ? Object.entries(agingBuckets).map(([aging, count]) => ({ aging, count }))
      : []

    const locationData = activeFilter === "Captira"
      ? Object.entries(locationCounts)
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      : []

    setDashboardData({
      balanceDistribution: balanceData,
      paymentAging: agingData,
      locationDistribution: locationData
    })
  }

  const handleRowClick = (defendant: CSVRow) => {
    setSelectedDefendant(defendant)
    setDialogOpen(true)
  }

  const handleCall = () => {
    if (activeFilter !== "Simply" && selectedDefendant?.['Mobile Ph #']) {
      window.location.href = `tel:${selectedDefendant['Mobile Ph #']}`
    } else if (activeFilter === "Simply" && selectedDefendant?.['Def. Phone']) {
      window.location.href = `tel:${selectedDefendant['Def. Phone']}`
    } else if (activeFilter === "Joint" && selectedDefendant?.['Contact']) {
      window.location.href = `tel:${selectedDefendant['Contact']}`
    }
  }

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  })

  const renderDefendantDialogContent = () => {
    if (!selectedDefendant) return null

    if (activeFilter === "Captira") {
      return (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</p>
              <p className="text-sm font-semibold mt-1">
                {selectedDefendant['Defendant'] || '-'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Date of Birth</p>
              <p className="text-sm font-semibold mt-1">
                {selectedDefendant['Date of Birth'] || '-'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Address</p>
            <p className="text-sm font-semibold mt-1">
              {selectedDefendant['Address'] || '-'}
            </p>
            <p className="text-sm font-semibold">
              {[
                selectedDefendant['City'],
                selectedDefendant['State'],
                selectedDefendant['Zip']
              ].filter(Boolean).join(', ') || '-'}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Mobile Phone</p>
            <p className="text-sm font-semibold mt-1">
              {selectedDefendant['Mobile Ph #'] || '-'}
            </p>
          </div>

          {selectedDefendant['Balance Owed'] && (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Balance Owed</p>
              <p className="text-lg font-bold mt-1">
                {selectedDefendant['Balance Owed']}
              </p>
            </div>
          )}
        </>
      )
    } else if (activeFilter === "Joint") {
      return (
        <>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</p>
            <p className="text-lg font-bold mt-1">{selectedDefendant['Defendant_Name'] || '-'}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Contact</p>
            <p className="text-sm font-semibold mt-1">{selectedDefendant['Contact'] || '-'}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Balance</p>
            <p className="text-lg font-bold mt-1">
              {selectedDefendant['Total_Balance'] || '-'}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Balance</p>
            <p className="text-lg font-bold mt-1">
              {selectedDefendant['Current_Balance'] || '-'}
            </p>
          </div>
        </>
      )
    } else {
      return (
        <>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</p>
            <p className="text-sm font-semibold mt-1">
              {selectedDefendant['Name'] || selectedDefendant['Def.'] || '-'}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone Number</p>
            <p className="text-lg font-bold mt-1">
              {selectedDefendant['Def. Phone'] || selectedDefendant['Total Due'] || '-'}
            </p>
          </div>
        </>
      )
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-900">
      <main className="w-full flex flex-col gap-8 bg-white dark:bg-black p-6 sm:p-8">
        <div className="flex w-full items-center justify-between border-b pb-4">
          <header className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Payment Recovery
          </header>
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="https://github.com/shadcn.png   " alt="Admin" />
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">Administrator</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Admin</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full gap-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-6">
            <Tabs defaultValue="Dashboard" className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <TabsList className="grid w-full grid-cols-2 sm:w-auto">
                  <TabsTrigger value="Dashboard">Dashboard</TabsTrigger>
                  <TabsTrigger value="Data">Data</TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button
                    variant={activeFilter === "Captira" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveFilter("Captira")}
                  >
                    Captira
                  </Button>
                  <Button
                    variant={activeFilter === "Simply" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveFilter("Simply")}
                  >
                    Simply
                  </Button>
                  <Button
                    variant={activeFilter === "Joint" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveFilter("Joint")}
                  >
                    Joint
                  </Button>
                </div>
              </div>

              <TabsContent value="Dashboard">
                <div className="p-6 border rounded-lg mt-4">
                  <h2 className="text-2xl font-semibold mb-6">Dashboard Overview - {activeFilter}</h2>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-medium text-gray-500 dark:text-gray-400`}>
                            Total Records
                          </p>
                          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                            {statCards.totalRecords.toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                          <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-medium text-gray-500 dark:text-gray-400`}>
                            {activeFilter === "Simply" ? "Total Due" : activeFilter === "Joint" ? "Total Balance" : "Total Balance Owed"}
                          </p>
                          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                            ${statCards.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
                          <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-medium text-gray-500 dark:text-gray-400`}>
                            {activeFilter === "Simply" ? "Outstanding Balance" : activeFilter === "Joint" ? "Current Balance" : "Current Balance"}
                          </p>
                          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                            ${statCards.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-full">
                          <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-medium text-gray-500 dark:text-gray-400`}>
                            % Paid
                          </p>
                          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                            {statCards.percentagePaid.toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-full">
                          <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {activeFilter !== "Simply" ? (
                    <div className="space-y-8">
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                        <h3 className="text-xl font-semibold mb-4">Balance Distribution</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={dashboardData.balanceDistribution}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="range" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#3b82f6" name="Number of Defendants" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {activeFilter === "Captira" && (
                        <>
                          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                            <h3 className="text-xl font-semibold mb-4">Days Since Last Payment</h3>
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart data={dashboardData.paymentAging}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="aging" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="count" name="Number of Defendants">
                                  {dashboardData.paymentAging.map((entry: any, index: number) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={index === 3 ? '#B97979' : index === 2 ? '#f59e0b' : index === 1 ? '#eab308' : '#10b981'} 
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                            <h3 className="text-xl font-semibold mb-4">Defendants by Location (Top 10 Cities)</h3>
                            <ResponsiveContainer width="100%" height={400}>
                              <BarChart data={dashboardData.locationDistribution} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="location" type="category" width={120} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="count" name="Number of Defendants">
                                  {dashboardData.locationDistribution.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={`hsl(${174 - index * 10}, 70%, ${60 - index * 3}%)`} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border">
                        <h3 className="text-xl font-semibold mb-4">Balance Distribution</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={dashboardData.balanceDistribution}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="range" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#3b82f6" name="Number of Defendants" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="Data">
                <div className="p-6 border rounded-lg mt-4">
                  <h2 className="text-2xl font-semibold mb-4">Data - {activeFilter}</h2>
                  
                  {/* Compact Filter Controls - Left aligned with continuous balance range */}
                  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                    <div className="flex flex-col lg:flex-row gap-4 items-start">
                      {/* Year Filter */}
                      {availableYears.length > 0 && (
                        <div className="flex-1 min-w-0 lg:max-w-xs">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                            Filter by Year
                          </label>
                          <select 
                            value={yearFilter} 
                            onChange={(e) => setYearFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                          >
                            <option value="all">All Years</option>
                            {availableYears.map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      {/* Balance Range Filter - Single continuous line */}
                      <div className="flex-1 min-w-0 lg:max-w-xs">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                          Balance Range
                        </label>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-16">
                            ${balanceRangeFilter[0].toLocaleString()}
                          </span>
                          <div className="flex-1 flex items-center">
                            <input
                              type="range"
                              min={minBalance}
                              max={maxBalance}
                              value={balanceRangeFilter[0]}
                              onChange={(e) => setBalanceRangeFilter([parseFloat(e.target.value), balanceRangeFilter[1]])}
                              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 appearance-none cursor-pointer"
                              style={{ borderRadius: '0.25rem 0 0 0.25rem' }}
                            />
                            <input
                              type="range"
                              min={minBalance}
                              max={maxBalance}
                              value={balanceRangeFilter[1]}
                              onChange={(e) => setBalanceRangeFilter([balanceRangeFilter[0], parseFloat(e.target.value)])}
                              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 appearance-none cursor-pointer"
                              style={{ borderRadius: '0 0.25rem 0.25rem 0' }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">
                            ${balanceRangeFilter[1].toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                     
                    </div>
                  </div>
                  
                  {loading ? (
                    <div className="text-center py-8">Loading data...</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <Input
                          placeholder="Search all columns..."
                          value={globalFilter ?? ""}
                          onChange={(e) => setGlobalFilter(e.target.value)}
                          className="max-w-sm"
                        />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Total records: {filteredData.length}
                        </p>
                      </div>

                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                              <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                  <TableHead key={header.id} className="whitespace-nowrap">
                                    {header.isPlaceholder
                                      ? null
                                      : flexRender(
                                          header.column.columnDef.header,
                                          header.getContext()
                                        )}
                                  </TableHead>
                                ))}
                              </TableRow>
                            ))}
                          </TableHeader>
                          <TableBody>
                            {table.getRowModel().rows?.length ? (
                              table.getRowModel().rows.map((row) => (
                                <TableRow
                                  key={row.id}
                                  data-state={row.getIsSelected() && "selected"}
                                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                  {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id} className="whitespace-nowrap">
                                      {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                      )}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell
                                  colSpan={columns.length}
                                  className="h-24 text-center"
                                >
                                  No data found. Make sure {activeFilter.toLowerCase()}-data.csv exists in the public folder.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Page {table.getState().pagination.pageIndex + 1} of{' '}
                          {table.getPageCount()}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Defendant Details Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {activeFilter} Information
              </DialogTitle>
            </DialogHeader>
            
            {selectedDefendant && (
              <div className="space-y-4 py-4">
                {renderDefendantDialogContent()}
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={handleCall}
                disabled={
                  activeFilter === "Simply" 
                    ? !selectedDefendant?.['Def. Phone']
                    : activeFilter === "Joint"
                    ? !selectedDefendant?.['Contact']
                    : !selectedDefendant?.['Mobile Ph #']
                }
                style={{ color: '#FFFFFF', backgroundColor: '#323232' }}
                className="w-full hover:opacity-90"
              >
                <Phone className="mr-2 h-4 w-4" />
                Call {activeFilter === "Simply" ? "Account" : "Defendant"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Collection Dialog */}
        <Dialog open={collectDialogOpen} onOpenChange={setCollectDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                Record Collection
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Enter collected amount for:
                </p>
                <p className="text-lg font-semibold">
                  {selectedRowForCollection?.[activeFilter === "Joint" ? "Defendant_Name" : activeFilter === "Simply" ? "Name" : "Defendant"] || 'N/A'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Collected Amount ($)
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={collectionAmountInput}
                  onChange={(e) => setCollectionAmountInput(e.target.value)}
                  className="mt-1"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => setCollectDialogOpen(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitCollection}
                style={{ color: '#FFFFFF', backgroundColor: '#323232' }}
                className="hover:opacity-90"
              >
                Submit Collection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}